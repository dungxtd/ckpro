"""Desktop workloads over VNC, one connection per phase so Xvnc reports each
one's screen updates when it disconnects. Updates are requested incrementally
and continuously, as noVNC does, so what is sent is what changed."""
import json
import sys
import time

from vncdotool import api

s = json.load(open("/work/session.json"))
PHASE = sys.argv[1]


def connect():
    return api.connect("127.0.0.1::5901", password=s["password"])


def follow(c, seconds, every=None):
    """Keep asking for changed areas for `seconds` (calling `every` each round)"""
    end = time.time() + seconds
    while time.time() < end:
        if every:
            every()
        c.refreshScreen(incremental=True)
        time.sleep(0.05)


c = connect()
if PHASE == "setup-terminal":
    c.mouseMove(564, 776)
    c.mousePress(1)
    time.sleep(3)
elif PHASE == "idle-terminal":
    follow(c, 15)
elif PHASE == "typing":
    for ch in "for i in $(seq 1 300); do echo line $i of a long listing; done":
        c.keyPress(ch)
    c.keyPress("enter")
    follow(c, 6)
elif PHASE == "setup-firefox":
    c.mouseMove(664, 776)
    c.mousePress(1)
    time.sleep(8)
    c.keyPress("ctrl-l")
    for ch in "https://kubernetes.io/docs/concepts/workloads/pods/":
        c.keyPress(ch)
    c.keyPress("enter")
    time.sleep(8)
elif PHASE == "scroll":
    c.mouseMove(640, 450)
    wheel = {"n": 0}

    def scroll():
        if wheel["n"] < 40:
            c.mousePress(5)
            wheel["n"] += 1

    follow(c, 12, scroll)
elif PHASE == "idle-firefox":
    follow(c, 15)
c.disconnect()
