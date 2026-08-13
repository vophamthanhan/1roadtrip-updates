# Cập nhật tự động

Chrome **không** tự cập nhật bản *Load unpacked*. Muốn máy khác tự nhận bản mới khi mở Chrome, phải cài một lần theo cách Chrome quản lý được: **Chrome Web Store** (khuyên dùng) hoặc **CRX tự host + Group Policy**.

Sau lần cài đó, extension gọi `requestUpdateCheck` mỗi khi Chrome khởi động / extension được load. Khi Chrome tải xong bản mới, nó reload extension và áp lại profile đã lưu.

## Cách 1 — Chrome Web Store, bản Unlisted (khuyên dùng)

Không cần server riêng. Mọi máy cài từ một link; Chrome tự cập nhật.

1. Tạo tài khoản [Chrome Web Store Developer](https://chrome.google.com/webstore/devconsole) (phí một lần).
2. Đóng gói:

```powershell
npm run package
```

3. Upload `dist/proxy-guard-sidebar-<version>.zip`.
4. Đặt visibility **Unlisted** nếu chỉ dùng nội bộ.
5. Gửi **một lần** link cài cho từng máy. Sau này chỉ việc tăng `version` trong `manifest.json` rồi upload zip mới.

Không thêm `update_url` vào zip Web Store — dashboard tự gắn updater của Google.

## Cách 2 — Tự host CRX (máy công ty / Group Policy)

Dùng khi không muốn đưa lên Web Store. Trên Chrome thông thường ở Windows, kéo file `.crx` vào Extensions **không** còn được cập nhật. Cần cài bằng policy, rồi Chrome mới hỏi `updates.xml` mỗi lần mở.

### Dùng GitHub làm trung gian (nên dùng GitHub Pages)

GitHub **làm được** nếu repo (hoặc site Pages) **công khai**. Chrome không đăng nhập GitHub, nên repo private sẽ không update được.

Đừng trỏ `update_url` vào `github.com/.../releases/latest/download`. Link đó bị redirect sang `objects.githubusercontent.com` và bộ cập nhật của Chrome thường tải hỏng. Dùng **GitHub Pages**: URL tĩnh, HTTPS, không redirect.

1. Tạo một repo công khai, ví dụ `1roadtrip-updates` (có thể tách khỏi repo source).
2. Bật **Settings → Pages** từ nhánh `main`, thư mục `/` hoặc `/docs`.
3. Copy cấu hình:

```powershell
Copy-Item updates\config.example.json updates\config.json
```

4. Sửa `updateBaseUrl`:

```json
{
  "updateBaseUrl": "https://YOUR_GITHUB_USER.github.io/1roadtrip-updates"
}
```

Nếu Pages dùng domain riêng thì ghi domain đó, vẫn phải là HTTPS.

5. Tạo bản phát hành:

```powershell
npm run release
```

Lần đầu script tạo `updates/extension.pem` (khóa ký, **giữ bí mật, backup**). Mất file này thì không đẩy update cho cùng extension id được.

Output trong `dist/`:

- `updates.xml`
- `1roadtrip-extension.crx`
- `proxy-guard-sidebar-<version>-update.zip`

6. Commit **đúng hai file** vào gốc repo Pages (hoặc `/docs` nếu Pages trỏ vào đó):

- `updates.xml`
- `1roadtrip-extension.crx`

Đợi 1–2 phút rồi mở trên trình duyệt; phải tải được, không bị trang 404/login:

- `https://YOUR_GITHUB_USER.github.io/1roadtrip-updates/updates.xml`
- `https://YOUR_GITHUB_USER.github.io/1roadtrip-updates/1roadtrip-extension.crx`

Mỗi lần ra bản mới: tăng `version`, chạy lại `npm run release`, ghi đè 2 file đó rồi push. Không gửi zip cho từng máy.

### Cài lần đầu bằng Policy (Windows) — gửi một lần

Gửi **file `.reg`**, không gửi zip extension. Chrome tự tải CRX từ GitHub Pages.

**Trên máy bạn (đã làm xong):** feed cập nhật đang chạy tại

- Extension ID: `odpmlkhhljpgfhfnkjmnakhdljhbjoak`
- Update URL: `https://vophamthanhan.github.io/1roadtrip-updates/updates.xml`

**Trên từng máy nhân viên, làm một lần:**

1. Tắt hết Chrome (khay hệ thống cũng tắt, kiểm tra Task Manager không còn `chrome.exe`).
2. Gửi họ một trong hai file trong thư mục `updates/`:
   - `install-chrome-policy-all-users.reg` — mọi user trên máy, **cần chuột phải → Run as administrator**
   - `install-chrome-policy-this-user.reg` — chỉ user Windows hiện tại, không cần admin
3. Double-click file → **Yes** / **Có** khi Windows hỏi nhập registry.
4. Mở lại Chrome. Đợi 10–30 giây.
5. Vào `chrome://extensions` — phải thấy **1Roadtrip Extension**, không cần Developer mode.
6. Kiểm tra policy: `chrome://policy` → bấm **Reload policies**. Phải có `ExtensionInstallForcelist` và `ExtensionInstallSources`.

Nếu chưa thấy extension: tắt hẳn Chrome rồi mở lại, hoặc trên `chrome://policy` bấm Reload policies.

Gỡ cài: chạy `updates/uninstall-chrome-policy.reg` (bản all-users cần admin), tắt Chrome, rồi xóa extension nếu còn.

Policy **không chọn được một Chrome profile** (Person 1 / Person 2). `ExtensionInstallForcelist` gắn hết profile của user Windows đó. Muốn đúng một profile thì không dùng `.reg`: mở đúng profile đó rồi cài **Chrome Web Store Unlisted**, hoặc Load unpacked (unpacked không tự update).

Công ty có Group Policy Editor (`gpedit.msc`) thì dùng Administrative Template của Chrome:

- **ExtensionInstallForcelist**: `odpmlkhhljpgfhfnkjmnakhdljhbjoak;https://vophamthanhan.github.io/1roadtrip-updates/updates.xml`
- **ExtensionInstallSources**: `https://vophamthanhan.github.io/*`

### Phát hành bản mới

1. Tăng `version` trong `manifest.json` và `package.json` (ví dụ `0.7.0` → `0.7.1`).
2. `npm run release`
3. Ghi đè `updates.xml` và `1roadtrip-extension.crx` trên GitHub Pages rồi push.

Không gửi zip/folder cho từng máy nữa. Khi họ mở Chrome, extension tự kiểm tra và reload bản mới.

## Load unpacked thì sao?

Bản *Load unpacked* không dùng updater của Chrome. Trong sidebar có nút **Update**:

1. Nút đọc `latest.json` trên GitHub Pages.
2. Nếu có bản mới, bấm Update → chọn **đúng thư mục** đã Load unpacked (lần đầu).
3. Extension tải từng file và ghi đè folder đó.
4. Mở `chrome://extensions` và bấm **Reload**.

Phát hành cho nút này: `npm run release` tạo `dist/pages-feed/` (`latest.json` + `files/`). Copy các file đó lên repo Pages cùng `updates.xml` và `.crx`.

## Profile cố định trong git

Proxy Profile Manager đọc `profiles/bundled-profiles.json` mỗi lần extension load. File này đi cùng zip / nút Update.

- `id` phải **ổn định** (ví dụ `git-nyc-1`). Đổi host/UA trong file này rồi phát hành, máy khác Reload sẽ thấy thay đổi.
- **Không** ghi password vào JSON. User nhập password một lần trên máy; Chrome giữ local.
- Profile tạo trên UI (không có id trong file) không bị xóa khi git cập nhật.
- Profile `GIT` trong dropdown là profile đến từ file này.

Mẫu:

```json
{
  "profiles": [
    {
      "id": "git-nyc-1",
      "name": "US New York",
      "proxy": {
        "scheme": "http",
        "host": "proxy.example.com",
        "port": 8000,
        "username": "user49183"
      },
      "userAgent": "",
      "validationUrl": "",
      "fingerprint": { "enabled": false, "locale": "en-US", "timezone": "America/New_York", "platform": "Windows" }
    }
  ]
}
```

Để trống `userAgent` thì lần Apply user bấm **Use current** hoặc chọn US User-Agent. Export JSON hiện tại (không có password) cũng có thể dán vào file này nếu thêm `id` cố định.

## Bảo mật khóa ký

- `updates/extension.pem` và `updates/config.json` đã được gitignore.
- Không commit, không gửi kèm zip cho user.
- `updates/extension-identity.json` (id + public key) có thể lưu lại để biết extension id.
