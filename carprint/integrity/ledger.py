"""Tamper-evident vehicle passport: hash-chained records signed with Ed25519.

record_hash = SHA-256(canonical_json(payload) || prev_hash). Anyone holding the public key can
re-verify the chain; changing or deleting a record breaks every later hash.
"""
from __future__ import annotations

import base64
import hashlib
import json
import sqlite3
import threading
import time
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

GENESIS = "0" * 64


def canonical(obj: dict) -> bytes:
    return json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()


def load_or_create_key(path: Path) -> Ed25519PrivateKey:
    if path.exists():
        return serialization.load_pem_private_key(path.read_bytes(), password=None)
    key = Ed25519PrivateKey.generate()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                       serialization.NoEncryption()))
    return key


class Ledger:
    def __init__(self, db_path: Path, key_path: Path):
        self._key = load_or_create_key(key_path)
        self._lock = threading.Lock()
        self._db = sqlite3.connect(db_path, check_same_thread=False)
        self._db.execute(
            "CREATE TABLE IF NOT EXISTS records (record_id TEXT PRIMARY KEY, vehicle_key TEXT, seq INTEGER,"
            " payload TEXT, prev_hash TEXT, record_hash TEXT, signature TEXT, created REAL)")
        self._db.commit()

    @property
    def public_key_pem(self) -> str:
        return self._key.public_key().public_bytes(serialization.Encoding.PEM,
                                                   serialization.PublicFormat.SubjectPublicKeyInfo).decode()

    def append(self, vehicle_key: str, record_id: str, payload: dict) -> dict:
        with self._lock:
            row = self._db.execute("SELECT seq, record_hash FROM records WHERE vehicle_key=? ORDER BY seq DESC LIMIT 1",
                                   (vehicle_key,)).fetchone()
            seq, prev_hash = (row[0] + 1, row[1]) if row else (0, GENESIS)
            body = canonical(payload)
            record_hash = hashlib.sha256(body + prev_hash.encode()).hexdigest()
            signature = base64.b64encode(self._key.sign(bytes.fromhex(record_hash))).decode()
            self._db.execute("INSERT INTO records VALUES (?,?,?,?,?,?,?,?)",
                             (record_id, vehicle_key, seq, body.decode(), prev_hash, record_hash, signature, time.time()))
            self._db.commit()
        return {"record_id": record_id, "seq": seq, "prev_hash": prev_hash, "record_hash": record_hash,
                "signature": signature}

    def timeline(self, vehicle_key: str) -> list[dict]:
        rows = self._db.execute("SELECT record_id, seq, payload, prev_hash, record_hash, signature, created FROM records"
                                " WHERE vehicle_key=? ORDER BY seq", (vehicle_key,)).fetchall()
        return [{"record_id": r[0], "seq": r[1], "payload": json.loads(r[2]), "prev_hash": r[3], "record_hash": r[4],
                 "signature": r[5], "created": r[6]} for r in rows]

    def verify_chain(self, vehicle_key: str) -> bool:
        return verify_records(self.timeline(vehicle_key), self._key.public_key())


def verify_records(records: list[dict], public_key: Ed25519PublicKey) -> bool:
    prev = GENESIS
    for r in records:
        expected = hashlib.sha256(canonical(r["payload"]) + prev.encode()).hexdigest()
        if r["prev_hash"] != prev or r["record_hash"] != expected:
            return False
        try:
            public_key.verify(base64.b64decode(r["signature"]), bytes.fromhex(expected))
        except Exception:
            return False
        prev = expected
    return True
