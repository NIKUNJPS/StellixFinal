"""Real-time WebSocket delivery (Batch 19).

Three pieces, deliberately separated:

* ``manager``  — holds THIS process's live sockets and fans out to them.
* ``events``   — the typed publish_* API. Publishes to Redis, callable from ANY
                 process (Celery worker, API pod, script).
* ``bridge``   — runs inside each API process: subscribes to Redis and hands
                 messages to the local manager.

The split exists because a process that has a socket and a process that knows a
thing happened are usually not the same process — see app/ws/events.py.
"""
