/**
 * Phase 6 strings (settings.html / screen-settings.js, admin.html / screen-admin.js, Stremio addon), verbatim from the
 * mockup; merged into `copy` by copy-vi.ts so every component still reads `copy.settings.*` / `copy.admin.*`.
 */
export const settingsCopy = {
  nav: ["Hồ sơ", "Phát", "Phụ đề", "Thiết bị & TV", "Phiên đăng nhập"],
  tabs: ["profile", "playback", "subtitles", "tv", "sessions"] as const,
  profile: {
    desc: "Tên và màu đại diện hiện với mọi người trong nhóm.", displayName: "Tên hiển thị", username: "Tên đăng nhập", usernameHint: "Không đổi được", color: "Màu đại diện", role: "Vai trò", admin: "Quản trị", member: "Thành viên",
    pwTitle: "Đổi mật khẩu", pwCurrent: "Mật khẩu hiện tại", pwNew: "Mật khẩu mới", pwNewHint: "Tối thiểu 8 ký tự", pwRepeat: "Nhập lại", pwWrong: "Mật khẩu hiện tại không đúng.", pwShort: "Mật khẩu mới tối thiểu 8 ký tự.", pwMismatch: "Mật khẩu nhập lại không khớp.", pwSubmit: "Đổi mật khẩu", pwDone: "✓ Đã đổi mật khẩu",
    pwMustChange: "Bạn đang dùng mật khẩu tạm do quản trị cấp. Hãy đổi mật khẩu mới ngay bên dưới.", nameEmpty: "Tên hiển thị không được để trống.",
  },
  playback: {
    desc: "Áp dụng cho mọi thiết bị bạn đăng nhập.", quality: "Chất lượng mặc định", qualityHint: "4K cần mạng ≥ 50 Mbps và máy hỗ trợ HEVC", q: ["1080p", "4K"], small: "Ưu tiên bản nhỏ", smallHint: "Chọn bản 2–4 GB khi có, tiết kiệm băng thông",
    autoplay: "Tự phát tập tiếp theo", autoplayHint: "Đếm ngược 10 giây ở cuối tập", askResume: "Hỏi “Tiếp tục từ…” khi mở phim", handoff: "Mở bằng app mặc định", handoffHint: "Khi bản phim cần app ngoài", apps: ["Tự động", "Stremio", "Infuse", "VLC"],
  },
  subs: {
    lang: "Ngôn ngữ ưu tiên", langs: ["Tiếng Việt", "English", "Tắt"], size: "Cỡ chữ", sizes: ["S", "M", "L"], autoAi: "Tự dịch AI khi không có bản Việt", autoAiHint: "Khoảng 500đ mỗi phim, DeepSeek qua Kie", sources: "Nguồn phụ đề", sourcesValue: "OpenSubtitles · SubDL · phụ đề nhúng",
    quota: "Hạn mức OpenSubtitles hôm nay", quotaHint: (h: number) => `Đặt lại sau ${h} giờ`, quotaValue: (u: number) => `${u}/20`, aiMonth: "Phụ đề AI đã dịch tháng này", aiMonthValue: (n: number, c: string) => `${n} phim · ${c}đ`,
  },
  tv: {
    desc: "Xem trên Android TV bằng Stremio, phát thẳng từ Torbox, không qua server.", title: "Cài trên Android TV (Stremio)",
    steps: ["Cài <b>Stremio</b> từ Google Play trên TV.", "Trong Stremio: Addons → ô “Addon URL” → dán link dưới, hoặc quét mã QR.", "Bấm <b>Install</b>. Các hàng phim “Lumen” xuất hiện ở trang chủ Stremio."],
    revoked: "— đã thu hồi, bấm Tạo link mới —", copy: "Sao chép link", downloadQr: "Tải mã QR", revoke: "Thu hồi link", create: "Tạo link mới",
    revokeTitle: "Thu hồi link Stremio?", revokeText: "TV đang dùng link này sẽ mất các hàng “Lumen” cho tới khi cài link mới.", revokeOk: "Thu hồi",
    iphone: "iPhone / iPad", iphoneHint: "Mở Safari → Chia sẻ → “Thêm vào màn hình chính” để dùng như app. Bản MKV sẽ mở bằng Infuse.", guide: "Xem hướng dẫn", pc: "Máy tính", pcHint: "Chrome hoặc Edge phát trực tiếp. Bản MKV mở bằng VLC.",
    copiedToast: "✓ Đã sao chép link addon", createdToast: "✓ Đã tạo link mới", revokedToast: "Đã thu hồi link Stremio", qrFile: "lumen-stremio-qr.png",
  },
  sessions: { desc: "Thiết bị đang đăng nhập tài khoản của bạn.", thisDevice: "Thiết bị này · đang hoạt động", current: "Hiện tại", logoutDevice: "Đăng xuất thiết bị này", logoutOthers: "Đăng xuất tất cả thiết bị khác", viaAddon: "qua link addon", stremioDevice: "Stremio · Android TV" },
  errToast: "✕ Không lưu được. Thử lại.",
} as const;

export const adminCopy = {
  title: "Quản trị", tabs: ["Tổng quan", "Thành viên", "Hàng đợi Torbox", "Nhật ký"], tabHrefs: ["/admin", "/admin/users", "/admin/queue", "/admin/activity"],
  kpi: { members: (a: number) => `thành viên · ${a} hoạt động`, watching: "đang xem lúc này", views: "lượt xem tháng này", ai: "phụ đề AI đã dịch", aiValue: (n: number, c: string) => `${n} · ${c}đ`, torbox: (a: number, b: number) => `Torbox · ${a}/${b} slot đang dùng`, os: "OpenSubtitles hôm nay", osValue: (u: number, l: number) => `${u}/${l}`, chart: "Lượt xem 30 ngày", watchingNow: "Đang xem lúc này", nobody: "Chưa có ai đang xem", plan: { 0: "Free", 1: "Essential", 2: "Pro", 3: "Standard" } as Record<number, string>, planUnknown: "—", bullet: "● " },
  actions: { invite: "＋ Tạo link mời", queue: "Xem hàng đợi", exportMonth: "Xuất báo cáo tháng (CSV)" },
  invites: {
    title: "Link mời", cols: ["Ghi chú", "Link", "Tạo bởi", "Hết hạn", "Trạng thái"], unused: "Chưa dùng", used: (n: string) => `Đã dùng · ${n}`, expired: "Hết hạn", revoked: "Đã huỷ", copy: "Sao chép", cancel: "Huỷ", recreate: "Tạo lại", empty: "Chưa có link mời nào.",
    noteFor: (n: string) => `Mời ${n}`, createTitle: "Tạo link mời", notePh: "Ghi chú (ví dụ: Mời Đạt)", expiry: "Hết hạn:", expiries: ["3 ngày", "7 ngày", "14 ngày"], uses: "Số lần dùng:", once: "1 lần", many: "Nhiều lần", create: "Tạo link",
    resultTitle: "Link mời đã tạo", resultText: (n: string, d: string) => `Gửi link này cho ${n}. Link dùng 1 lần, hết hạn ${d}.`, resultTextMany: (d: string) => `Link dùng được nhiều lần, hết hạn ${d}.`, downloadQr: "Tải mã QR", copyLink: "Sao chép link", copiedToast: "✓ Đã sao chép link mời", qrFile: "lumen-invite-qr.png", recipientFallback: "người được mời",
  },
  members: {
    title: (n: number) => `Thành viên · ${n}`, searchPh: "Tìm theo tên hoặc đăng nhập", filters: ["Tất cả", "Hoạt động", "Đã khoá", "Chưa kích hoạt"], filterKeys: ["all", "active", "locked", "pending"] as const,
    cols: ["Thành viên", "Vai trò", "Hoạt động gần nhất", "Lượt xem/tháng ▾", "Chất lượng", "Thiết bị", "Trạng thái"], watching: (t: string) => `Đang xem · ${t}`, neverLoggedIn: "Chưa đăng nhập", noDevice: "—", empty: "Không có thành viên nào khớp.",
    status: { ok: "Hoạt động", off: "Đã khoá", wait: "Chưa kích hoạt" }, resetPw: "Đặt lại MK", lock: "Khoá", unlock: "Mở khoá", resend: "Gửi lại link", more: "⋯", moreTitle: "Đặt lại mật khẩu, Khoá, Xoá",
    menu: { resetPw: "Đặt lại mật khẩu", roleAdmin: "Đổi vai trò → Quản trị", roleMember: "Đổi vai trò → Thành viên", history: "Xem lịch sử xem", revokeStremio: "Thu hồi link Stremio", lock: "Khoá tài khoản", unlock: "Mở khoá tài khoản", delete: "Xoá thành viên" },
    resetTitle: (u: string) => `Mật khẩu tạm cho “${u}”`, resetText: (n: string) => `Chỉ hiện một lần. ${n} sẽ phải đổi mật khẩu khi đăng nhập lần tới.`, resetOk: "Sao chép và đóng",
    resendTitle: (u: string) => `Thông tin đăng nhập cho “${u}”`, resendText: (n: string) => `Gửi link và mật khẩu tạm này cho ${n} (chỉ hiện một lần, dùng trong 48 giờ). ${n} sẽ phải đổi mật khẩu khi đăng nhập.`,
    resendClipboard: (url: string, u: string, pw: string) => `${url}\nTên đăng nhập: ${u}\nMật khẩu tạm: ${pw}`, copiedLogin: "✓ Đã sao chép link + mật khẩu tạm", alreadyActiveToast: "Thành viên này đã đăng nhập rồi — dùng “Đặt lại mật khẩu”.", stillValidToast: "Link mời này vẫn còn hiệu lực.",
    lockTitle: (u: string) => `Khoá tài khoản “${u}”?`, lockText: (n: string) => `${n} sẽ bị đăng xuất khỏi mọi thiết bị và không đăng nhập được. Danh sách và tiến độ xem được giữ lại, mở khoá bất cứ lúc nào.`, lockOk: "Khoá",
    deleteOk: "Xoá vĩnh viễn", lockedToast: (n: string) => `Đã khoá “${n}”`, unlockedToast: (n: string) => `Đã mở khoá “${n}”`, deletedToast: (n: string) => `Đã xoá thành viên “${n}”`, roleToast: (n: string, r: string) => `${n} → ${r}`, revokedToast: (n: string) => `Đã thu hồi link Stremio của ${n}`, copiedPw: "✓ Đã sao chép mật khẩu tạm", selfToast: "Không thể tự khoá / xoá tài khoản của mình.", lastAdminToast: "Phải còn ít nhất một quản trị.",
    devices: { pc: "PC", mac: "MacBook", iphone: "iPhone", ipad: "iPad", android: "Android", androidTv: "Android TV", stremio: "Android TV (Stremio)", other: "Khác" },
  },
  queue: {
    title: "Hàng đợi Torbox", slots: (a: number, b: number) => `${a}/${b} slot`, cols: ["Phim", "Bản", "Yêu cầu bởi", "Tiến độ", "Tốc độ", "Còn lại"], queued: "Xếp hàng", failed: "Thất bại · 0 seed", cancel: "Huỷ", prioritize: "Ưu tiên", retry: "Thử lại", remove: "Xoá",
    doneToday: (n: number) => `Hoàn thành hôm nay · ${n}`, doneCols: ["Phim", "Bản", "Yêu cầu bởi", "Xong lúc"], emptyTitle: "Không có gì đang tải", emptyHint: "Mọi yêu cầu “Tải lên cloud” của thành viên sẽ hiện ở đây.", eta: (m: number) => `~${m} phút`, speed: (mb: string) => `${mb} MB/s`, dash: "—", pack: "(trọn mùa)",
  },
  activity: {
    filters: ["Tất cả", "Xem", "Tải cloud", "Dịch AI", "Đăng nhập", "Mời"], filterKinds: ["all", "view", "cloud", "translate", "login", "invite"] as const, person: "Người: Tất cả ▾", personNamed: (n: string) => `Người: ${n} ▾`, personAll: "Tất cả", exportCsv: "Xuất CSV", empty: "Chưa có hoạt động nào.", yesterday: (t: string) => `Hôm qua ${t}`,
    view: (n: string, t: string, q: string) => `<b>${n}</b> bắt đầu xem ${t} (${q}, phát trực tiếp)`, viewApp: (n: string, t: string, app: string) => `<b>${n}</b> mở ${t} bằng ${app}`, translate: (n: string, t: string, cues: string, cost: string) => `<b>${n}</b> dịch phụ đề AI cho ${t} (${cues} câu · ${cost}đ)`,
    cloudDone: (t: string, n: string) => `Torbox tải xong ${t} (yêu cầu bởi ${n})`, cloudReq: (n: string, t: string) => `<b>${n}</b> yêu cầu tải ${t} lên cloud`, login: (n: string, dev: string) => `<b>${n}</b> đăng nhập từ ${dev}`, invite: (n: string, note: string) => `<b>${n}</b> tạo link mời “${note}”`, join: (n: string) => `<b>${n}</b> tạo tài khoản qua link mời`,
    csvHeader: ["Thời gian", "Loại", "Người", "Nội dung"],
  },
  notifyRequest: (n: string, t: string) => `<b>${n}</b> yêu cầu thêm “${t}”`, requestIcon: "🎬",
} as const;

/** Stremio addon (Android TV) — the only strings a TV ever shows from us. */
export const stremioCopy = {
  name: "Lumen", description: "Phim tiếng Việt cho nhóm bạn: catalog TMDB, phát thẳng từ Torbox, phụ đề Việt.",
  catalogs: { trendingMovie: "Phim lẻ thịnh hành hôm nay", trendingSeries: "Phim bộ thịnh hành hôm nay", anime: "Anime", myList: "Danh sách của tôi" },
  streamName: (q: string) => `Lumen\n${q}`, cached: "✅ Đã cache · phát ngay", lastPick: "⭐ Lần trước", uncached: "⬇ Chưa cache · Stremio tự tải", app: "Stremio", episode: (s: number, e: number) => `S${s} T${e}`, deviceLabel: "Android TV (Stremio)",
  langs: { vi: "Tiếng Việt", en: "English" }, aiSuffix: " (Dịch AI)", runtime: (m: number) => `${m} phút`, noOverview: "(Chưa có mô tả tiếng Việt)",
} as const;
