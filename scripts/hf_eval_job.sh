#!/usr/bin/env bash
# Runs inside an HF Job (T4): installs deps, copies the mounted repo, runs identity evaluations and the benchmark,
# then uploads eval outputs to the private dataset repo under runs/<RUN_ID>/.
# EVAL_SETS: space-separated "manifest:name:vehicle_crop(0|1)".
set -uo pipefail
pip install -q opencv-python-headless scipy pillow kornia matplotlib "rfdetr==1.11.2" huggingface_hub
pip install -q --no-deps https://github.com/cvg/LightGlue/archive/refs/heads/main.zip
pip install -q --force-reinstall --no-deps opencv-python-headless
cp -r /repo /work && cd /work
RUN_ID=${RUN_ID:-run_$(date +%H%M%S)}
mkdir -p out
nvidia-smi --query-gpu=name --format=csv,noheader | tee out/gpu.txt
for spec in ${EVAL_SETS:-"data/test/commons_mined/manifest.json:calib_v1:1"}; do
  IFS=: read -r manifest name crop <<< "$spec"
  echo "=== $name ($manifest, vehicle_crop=$crop)"
  CARPRINT_SUBJECT=$crop python eval/evaluate_identity.py "$manifest" data/cohort "out/${name}.json" > "out/${name}.log" 2>&1
  grep -v -i "warn" "out/${name}.log" | tail -n 45
done
CARPRINT_SUBJECT=1 python scripts/bench.py data/cohort/nexia 6 > out/bench.log 2>&1; tail -n 30 out/bench.log
cp eval/bench_*.json out/ 2>/dev/null
python - <<PY
import os
from huggingface_hub import HfApi
HfApi().upload_folder(folder_path="out", repo_id="Azamaka/carprint-data", repo_type="dataset",
                      path_in_repo=f"runs/{os.environ.get('RUN_ID', '$RUN_ID')}", commit_message="eval run $RUN_ID")
print("uploaded runs/$RUN_ID")
PY
