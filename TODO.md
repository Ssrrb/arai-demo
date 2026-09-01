# Realtime leaderboard production TODOs

The included server provides a working leaderboard with WebSocket updates and PostgreSQL persistence. Before running a public or competitive deployment:

- [ ] **Make scoring authoritative.** The browser currently reports its final score. Move game simulation/validation server-side or send signed run events and reject impossible score, distance, timing, and banana combinations.
- [ ] **Add player identity.** Names are display names, not accounts, and equal names share one leaderboard slot. Add anonymous device IDs or login, reserve names, and issue server-validated session tokens.
- [x] **Use shared durable storage.** Scores are stored in PostgreSQL with one highest-score row per normalized player name and an index for score ordering. Add managed migrations, backups, and retention rules before production.
- [ ] **Scale realtime fan-out.** Add Redis pub/sub (or equivalent) so leaderboard updates reach WebSocket clients connected to different app replicas.
- [ ] **Strengthen abuse controls.** Use proxy-aware IP and account rate limits, origin checks, payload metrics, bans, and bot protection. Keep WebSocket message limits enabled.
- [ ] **Define ranking rules.** Decide whether rankings are all-time, daily, seasonal, per-level, or per-game-version. Include game version and season in submissions.
- [ ] **Improve delivery guarantees.** The server returns explicit accepted/rejected acknowledgements; queue completed runs in IndexedDB and retry them after reconnect.
- [ ] **Add observability.** Export structured logs, connection/submission counters, latency/error metrics, and alerts for persistence failures.
- [ ] **Test.** Add unit tests for validation/ranking, WebSocket integration tests, reconnect tests, concurrency/load tests, and browser/mobile UI tests.
- [ ] **Harden deployment.** Terminate TLS at a reverse proxy/load balancer, configure trusted origins and security headers there, scan the image/dependencies, and pin base-image/package digests.
