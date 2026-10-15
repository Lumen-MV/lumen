# Lumen

Web app xem phim kiểu Netflix cho **một nhóm bạn nhỏ**, tự cài trên VPS của bạn. Giao diện tiếng Việt, catalog từ
TMDB, phát thẳng từ tài khoản **TorBox** của bạn (torrent đã cache trên cloud), phụ đề Việt (OpenSubtitles / SubDL /
phụ đề nhúng / dịch AI), addon Stremio cho Android TV, hand-off sang Infuse / VLC trên iPhone và Apple TV.

*English:* a self-hosted, invite-only streaming web app for a small friend group (Vietnamese UI). Next.js 15 +
SQLite, TMDB catalog, playback through your own TorBox account, community + AI subtitles, Stremio addon for TV.
Bring your own API keys. MIT licensed.

> **Lưu ý pháp lý.** Đây là phần mềm mã nguồn mở, không kèm nội dung, không kèm tài khoản. Mỗi người tự cài,
> tự dùng khoá API và tài khoản TorBox của mình, và tự chịu trách nhiệm về nội dung mình phát theo luật nơi mình ở.
> Không có server demo công khai. Dữ liệu phim từ TMDB; app không được TMDB chứng nhận.

## Tính năng

- Trang chủ: hero, Top 10, hàng phim thịnh hành / phim bộ / anime, "Dành cho bạn", tìm kiếm tiếng Việt và tiếng Anh.
- Chọn bản phát: tự tìm release qua Torrentio + YTS, kiểm tra cache TorBox, chấm điểm 1080p / 2160p, tải lên cloud khi chưa cache.
- Trình phát trong web: tiếp tục xem, tập tiếp theo, phụ đề (tìm, chỉnh lệch, cỡ chữ), dịch phụ đề Anh → Việt bằng AI.
- Danh sách của tôi, thông báo tập mới, lịch sử xem.
- Thành viên qua **link mời** (không đăng ký công khai), khoá tài khoản, đặt lại mật khẩu, quản trị hàng chờ và hoạt động.
- Android TV: addon Stremio riêng cho từng người (thu hồi được). iPhone / Apple TV: mở bằng Infuse hoặc VLC.
- Chạy bằng Docker + Caddy (HTTPS tự động), SQLite một file, sao lưu hằng đêm.

## Bạn cần gì

| Cần | Ghi chú |
|---|---|
| VPS Ubuntu 22.04 / 24.04, 1 vCPU, 2 GB RAM | Azure, Hetzner, DigitalOcean, Vultr… đều được. Video **không** đi qua VPS ở chế độ `direct`. |
| Một tên miền trỏ về VPS | Caddy tự xin chứng chỉ Let's Encrypt. |
| Tài khoản TorBox (gói có download slot) | `TORBOX_API_KEY`. Đây là khoá nhạy cảm nhất, xem phần bảo mật. |
| TMDB read access token | Miễn phí, tạo tại themoviedb.org. |
| OpenSubtitles API key + tài khoản, SubDL API key | Tuỳ chọn, cho phụ đề cộng đồng. |
| Khoá dịch AI: Kie (DeepSeek) hoặc DeepSeek hoặc Anthropic | Tuỳ chọn, cho tính năng dịch phụ đề. |

## Cài nhanh trên VPS

Hướng dẫn chi tiết từng bước (tiếng Việt, không cần biết code): [infra/README-deploy-vi.md](infra/README-deploy-vi.md).

Tóm tắt:

```bash
git clone <repo này> lumen && cd lumen
cp .env.example .env            # điền APP_URL, APP_DOMAIN, ACME_EMAIL, SESSION_SECRET, ADMIN_*, các khoá API
VM_HOST=<ip-vps> infra/deploy.sh   # rsync lên VPS, build Docker, migrate DB, chạy compose, kiểm tra /api/health
```

Hoặc chạy ngay trên VPS đã có Docker:

```bash
cp .env.example .env && nano .env
docker compose up -d --build
curl -s https://<APP_DOMAIN>/api/health     # {"ok":true}
```

Đăng nhập bằng `ADMIN_USERNAME` / `ADMIN_PASSWORD`, vào **Quản trị → Thành viên → Tạo link mời** để mời bạn bè.

## Cấu hình

Mọi thứ nằm trong `.env` (mẫu: [.env.example](.env.example)). App từ chối khởi động và liệt kê các khoá thiếu
hoặc sai (`src/lib/config/env.ts`).

| Biến | Ý nghĩa |
|---|---|
| `APP_URL`, `APP_DOMAIN`, `ACME_EMAIL` | URL công khai, tên miền cho Caddy, email nhận cảnh báo chứng chỉ |
| `SESSION_SECRET` | ≥ 32 ký tự ngẫu nhiên (`openssl rand -base64 48`) |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_DISPLAY_NAME` | Tài khoản quản trị đầu tiên, tạo khi khởi động |
| `TMDB_READ_TOKEN`, `TORBOX_API_KEY`, `TORRENTIO_BASE` | Catalog và nguồn phát |
| `OPENSUBTITLES_*`, `SUBDL_API_KEY` | Phụ đề cộng đồng |
| `TRANSLATOR`, `KIE_*`, `DEEPSEEK_*`, `ANTHROPIC_API_KEY` | Dịch phụ đề bằng AI |
| `STREAM_MODE` | `direct` (video đi thẳng TorBox → thiết bị, gần như không tốn băng thông VPS) hoặc `proxy` (đi qua VPS, khoá TorBox không bao giờ rời server) |
| `MAX_CONCURRENT_VIEWERS`, `MAX_CLOUD_JOBS`, `DEFAULT_QUALITY` | Giới hạn người xem đồng thời, số job cloud, chất lượng mặc định |
| `LUMEN_SWEEPER` | `1` bật quét nguồn nền, sao lưu đêm, kiểm tra tập mới |
| `LUMEN_SCENARIOS` | Chỉ `1` khi phát triển (bật trang `/dev/ui` và API giả lập) |

## Bảo mật, điều nên biết

- Ở chế độ `direct`, link CDN của TorBox có chứa khoá API của bạn và tới được trình duyệt / TV của từng thành viên.
  Khi một người rời nhóm: **đổi khoá TorBox** rồi chạy lại deploy. Hoặc dùng `proxy` và chấp nhận tốn băng thông.
- File sao lưu (`data/backups/`) chứa link mời và link Stremio đang hiệu lực. Không gửi qua chat / email.
- Mọi phản hồi mang `X-Robots-Tag: noindex`, `robots.txt` chặn toàn bộ. App không dành cho công khai.
- Đăng nhập có giới hạn tốc độ; link Stremio giới hạn 60 yêu cầu / phút và thu hồi được từ Cài đặt.

## Phát triển

```bash
cp .env.example .env.local
npm install                       # better-sqlite3 cần trình biên dịch C++ trên Windows (VS Build Tools)
LUMEN_SCENARIOS=1 npm run dev        # http://localhost:3000
npm run typecheck && npm run lint && npm test && npm run build
```

Ghi chú kỹ thuật chi tiết (kiến trúc, từng API, bộ QA Playwright theo giai đoạn): [docs/dev-notes.md](docs/dev-notes.md).

## Giấy phép

MIT. Xem [LICENSE](LICENSE). Dự án này được chia sẻ nguyên trạng; ai tải về muốn sửa gì thì cứ sửa, không có cam kết cập nhật hay hỗ trợ.
