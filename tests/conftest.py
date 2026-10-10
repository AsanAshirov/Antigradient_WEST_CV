import os

# Synthetic test scenes contain no real car: run the identity core on the whole frame and never download detector
# weights during tests. The vehicle crop is evaluated on real photos in eval/.
os.environ.setdefault("CARPRINT_SUBJECT", "0")
