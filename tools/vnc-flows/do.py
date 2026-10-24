"""Run a few VNC actions given as arguments, for exploring the desktop:
  click X Y | dbl X Y | drag X1 Y1 X2 Y2 | key NAME | text "..." | sleep S | shot NAME"""
import json
import sys
import time

from vncdotool import api

s = json.load(open("/work/session.json"))
c = api.connect("127.0.0.1::5901", password=s["password"])
args = sys.argv[1:]
i = 0
while i < len(args):
    a = args[i]
    if a == "click":
        c.mouseMove(int(args[i + 1]), int(args[i + 2])); c.mousePress(1); i += 3
    elif a == "dbl":
        c.mouseMove(int(args[i + 1]), int(args[i + 2])); c.mousePress(1); time.sleep(0.12); c.mousePress(1); i += 3
    elif a == "drag":
        x1, y1, x2, y2 = (int(v) for v in args[i + 1:i + 5])
        c.mouseMove(x1, y1); c.mouseDown(1)
        for k in range(1, 11):
            c.mouseMove(x1 + (x2 - x1) * k // 10, y1 + (y2 - y1) * k // 10); time.sleep(0.03)
        c.mouseUp(1); i += 5
    elif a == "key":
        c.keyPress(args[i + 1]); i += 2
    elif a == "text":
        for ch in args[i + 1]:
            c.keyPress(ch)
        i += 2
    elif a == "sleep":
        time.sleep(float(args[i + 1])); i += 2
    elif a == "shot":
        c.captureScreen(f"/work/{args[i + 1]}.png"); i += 2
    else:
        raise SystemExit(f"unknown action {a}")
c.disconnect()
