# Lumen — Hướng dẫn tự cài lên VPS (không cần biết code)

Toàn bộ app chạy trên **một máy chủ Ubuntu nhỏ** với Docker. Máy chủ chỉ phục vụ trang web + JSON + phụ đề;
ở chế độ `direct`, **video đi thẳng từ TorBox về từng thiết bị**, không qua máy chủ nên tốn rất ít băng thông.

Mọi lệnh dưới đây chạy trên **máy tính của bạn** trong *Git Bash* (Windows, cài kèm Git), *Terminal* (Mac) hoặc
*WSL*. Chỗ nào có `<...>` thì thay bằng giá trị của bạn.

## 0. Chuẩn bị (làm một lần)

| Cần gì | Lấy ở đâu |
|---|---|
| Một VPS Ubuntu 22.04 / 24.04, 1 vCPU, 2 GB RAM, đăng nhập bằng khoá SSH | Hetzner, DigitalOcean, Vultr, Azure, AWS Lightsail… Mở cổng **22, 80, 443** |
| Một cặp khoá SSH | `ssh-keygen -t ed25519` (Enter 3 lần) → tạo `~/.ssh/id_ed25519.pub`, dán vào VPS khi tạo |
| Một tên miền (ví dụ `phim.example.com`) | Bất kỳ nhà đăng ký nào. Chọn tên trung lập |
| Các khoá API: TMDB, TorBox, OpenSubtitles, SubDL, Kie / DeepSeek / Anthropic (tuỳ chọn) | Tạo trên từng trang dịch vụ, bằng tài khoản của bạn |

Trên VPS cần có Docker Engine + compose plugin. Cách nhanh nhất:

```bash
ssh <user>@<IP>
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && exit
```

Dùng Azure và `az` CLI? `infra/azure/create-vm.sh --name lumen --location southeastasia` tạo sẵn resource
group, IP tĩnh, tường lửa (SSH chỉ từ IP của bạn) và một VM Ubuntu với Docker, ufw, fail2ban, swap 2 GB
(`infra/azure/cloud-init.yaml`). Đây là tuỳ chọn, mọi VPS khác đều dùng được theo các bước dưới.

## 1. Trỏ tên miền về IP

Ở trang quản lý tên miền, thêm bản ghi **A**:

```
phim.example.com   A   <IP của VPS>
```

Đợi 5–30 phút. Kiểm tra: `nslookup phim.example.com` phải ra đúng IP.

## 2. Tạo file `.env`

```bash
git clone <địa chỉ repo> lumen && cd lumen
cp .env.example .env
```

Mở `.env` và điền (những dòng khác giữ nguyên):

```
NODE_ENV=production
APP_URL=https://phim.example.com
APP_DOMAIN=phim.example.com
ACME_EMAIL=<email của bạn>        # Let's Encrypt gửi cảnh báo chứng chỉ vào đây
SESSION_SECRET=<chuỗi ngẫu nhiên ≥ 32 ký tự>   # openssl rand -base64 48
ADMIN_USERNAME=<tên đăng nhập quản trị>
ADMIN_PASSWORD=<mật khẩu mạnh>
ADMIN_DISPLAY_NAME=<tên hiển thị>
TMDB_READ_TOKEN=...   TORBOX_API_KEY=...   OPENSUBTITLES_API_KEY/USER/PASS=...   SUBDL_API_KEY=...   KIE_API_KEY=...
STREAM_MODE=direct
LUMEN_SWEEPER=1
LUMEN_SCENARIOS=0
TRUST_PROXY=1
```

- `infra/deploy.sh` **dừng ngay** và liệt kê các dòng còn trống nếu thiếu `APP_URL`, `APP_DOMAIN`, `ACME_EMAIL`,
  `SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`.
- `STREAM_MODE=direct`: video đi thẳng TorBox → thiết bị. Link phát có chứa khoá TorBox của bạn; nếu một người
  rời nhóm → **đổi khoá TorBox** (mục 8).
- `STREAM_MODE=proxy`: video đi qua VPS (khoá không lộ) nhưng tốn băng thông (~2–4 GB mỗi phim).

**Không bao giờ** đưa file `.env` lên Git, chat hay email.

## 3. Đưa app lên VPS

```bash
VM_HOST=<IP> VM_USER=<user ssh> infra/deploy.sh
```

Script sẽ: copy mã nguồn lên VPS (`/opt/lumen`, đổi bằng `APP_DIR=`) → copy `.env` (chỉ chủ đọc được) → chỉnh
thư mục `data` cho đúng chủ (uid 1000 = user bên trong container) → **sao lưu cơ sở dữ liệu** (mặc định;
`--no-backup` để bỏ) → build Docker → chạy nâng cấp cấu trúc dữ liệu trong một container tạm → `docker compose up -d`
→ đợi app khoẻ → gọi `https://phim.example.com/api/health` → in hướng dẫn quay lại bản cũ. Lần đầu mất ~5 phút
(build + xin chứng chỉ HTTPS tự động). Thấy `OK` là xong.

Không muốn dùng script? Trên VPS: `git clone`, `cp .env` vào, `docker compose up -d --build`.

Mở trình duyệt: `https://phim.example.com` → đăng nhập bằng `ADMIN_USERNAME` / `ADMIN_PASSWORD`.

Cập nhật sau này: chạy lại đúng lệnh trên. Nếu bản mới lỗi: `git checkout <commit cũ>` (script in ra mã commit
vừa triển khai) → `VM_HOST=<IP> infra/deploy.sh --no-backup`; cần dữ liệu cũ thì khôi phục theo mục 6.

## 4. Mời người đầu tiên

1. Avatar góc phải → **Quản trị** → tab **Thành viên** → **＋ Tạo link mời**.
2. Ghi chú (ví dụ "Mời Đạt"), hết hạn 7 ngày, 1 lần → **Tạo link** → **Sao chép link** (hoặc **Tải mã QR**).
3. Gửi link cho bạn. Bạn mở link, đặt tên đăng nhập + mật khẩu → vào xem ngay.
4. Trên iPhone: Safari → Chia sẻ → **Thêm vào màn hình chính** để dùng như app.

## 5. Android TV: cài Stremio + addon Lumen

1. Trên TV: Google Play → cài **Stremio**.
2. Trên điện thoại: vào `https://phim.example.com` → avatar → **Cài đặt** → **Thiết bị & TV** → **Tải mã QR** (hoặc **Sao chép link**).
3. Trên TV: Stremio → **Addons** → ô *Addon URL* → dán link (hoặc dùng app Stremio trên điện thoại quét QR) → **Install**.
4. Trang chủ Stremio có thêm các hàng **"Phim lẻ thịnh hành hôm nay", "Phim bộ thịnh hành hôm nay", "Anime", "Danh sách của tôi"**. Bấm phim → chọn dòng **Lumen ✅ Đã cache** → phát thẳng từ TorBox.
5. Mỗi người có **link riêng**. Mất TV / cho mượn TV → **Thu hồi link** trong Cài đặt → TV mất các hàng Lumen ngay; bấm **Tạo link mới** để cài lại.

## 6. Sao lưu

- App tự chép SQLite mỗi đêm 03:15 vào `data/backups/` (giữ 14 bản).
- Thêm cron trên VPS để gói cả phụ đề và giữ 14 ngày:

```bash
ssh <user>@<IP>
crontab -e
# dán dòng này rồi lưu:
30 3 * * * DATA_DIR=/opt/lumen/data /opt/lumen/infra/backup.sh >> /opt/lumen/data/backups/backup.log 2>&1
```

- Thỉnh thoảng kéo bản sao về máy: `scp <user>@<IP>:/opt/lumen/data/backups/lumen-<ngày>.tar.gz .` (cron chạy với `sudo` nên file thuộc root; `sudo chown <user> /opt/lumen/data/backups/*.tar.gz` trước khi `scp`). File sao lưu chứa link mời + link Stremio đang hiệu lực nên script đặt quyền 600 — **không** gửi file này qua chat / email.
- Khôi phục (thứ tự quan trọng — nếu còn file `-wal` cũ bên cạnh, SQLite sẽ ghi đè bản khôi phục bằng dữ liệu cũ):

```bash
ssh <user>@<IP>
cd /opt/lumen
docker compose stop app
sudo rm -f data/lumen.sqlite-wal data/lumen.sqlite-shm
sudo tar -xzf data/backups/lumen-<ngày>.tar.gz -C /tmp lumen.sqlite
sudo cp /tmp/lumen.sqlite data/lumen.sqlite && sudo chown 1000:1000 data/lumen.sqlite
docker compose start app
curl -s https://phim.example.com/api/health   # {"ok":true}
```

- Kiểm tra một bản sao lưu còn mở được: `sqlite3 /tmp/lumen.sqlite 'pragma integrity_check'` → `ok`.

## 7. Theo dõi & bảo trì

| Việc | Lệnh (sau khi `ssh <user>@<IP>`, `cd /opt/lumen`) |
|---|---|
| App có sống không | `curl -s https://phim.example.com/api/health` → `{"ok":true,...}` |
| Xem log | `docker compose logs --tail 100 app` / `docker compose logs --tail 50 caddy` |
| Khởi động lại | `docker compose restart app` |
| VPS reboot | Docker tự chạy lại cả 2 container (< 60 giây) |
| Dung lượng đĩa | `df -h /` — SQLite + phụ đề vài trăm MB là nhiều |

## 8. Đổi khoá (khi một người rời nhóm hoặc nghi lộ)

1. **TorBox**: torbox.app → Settings → *Reset API key* → dán khoá mới vào `.env` → `VM_HOST=<IP> infra/deploy.sh --no-build`. Link phát cũ chết ngay.
2. **Khoá tài khoản thành viên**: Quản trị → Thành viên → ⋯ → **Khoá tài khoản** (đăng xuất mọi thiết bị, Stremio ngừng) hoặc **Thu hồi link Stremio**.
3. **Mật khẩu quên**: ⋯ → **Đặt lại mật khẩu** → gửi mã tạm (dạng `Gk7-mPx2-Q9w`), người đó phải đổi khi đăng nhập lần tới. Mã tạm chỉ dùng được **48 giờ**. Với người **chưa đăng nhập lần nào**, nút **Gửi lại link** cấp mã tạm mới + link đăng nhập (hiện một lần).
4. `SESSION_SECRET` đổi → mọi người phải đăng nhập lại (dùng khi nghi lộ cookie).
5. Nghi lộ link Stremio: link bị gọi quá 60 lần/phút (10 lần/phút cho phát phim) sẽ bị chặn tạm; thu hồi link trong Cài đặt.

## 9. Chi phí tham khảo

- VPS 1 vCPU / 2 GB ≈ 4–15 € mỗi tháng tuỳ nhà cung cấp; băng thông ra ≈ 0 ở chế độ `direct`, 2–4 GB mỗi phim ở chế độ `proxy`.
- TorBox theo gói bạn chọn. OpenSubtitles miễn phí 20 lượt tải / ngày. Dịch AI tính theo số câu, thường vài trăm đồng một phim với DeepSeek.

## 10. Chuyển sang nhà cung cấp khác

Cùng `docker-compose.yml` + `Caddyfile` + `.env`: tạo VPS mới có Docker, rồi `VM_HOST=<IP mới> infra/deploy.sh`.
Chép thư mục `data/` (hoặc khôi phục từ sao lưu theo mục 6). Đổi bản ghi A sang IP mới. Dưới 1 giờ.

## 11. Máy Windows để phát triển (không bắt buộc)

`npm install` trên Windows với Node 22 phải biên dịch `better-sqlite3` → cần **Visual Studio Build Tools**
(chọn "Desktop development with C++"). Trên VPS không cần gì: Docker tự biên dịch khi build.

## Những gì script KHÔNG làm (bạn làm tay)

- Mua tên miền + bản ghi DNS (bước 1).
- Tạo VPS, cài Docker (bước 0), mở cổng 22 / 80 / 443.
- Cài Stremio trên từng TV, gửi link mời cho từng người.
