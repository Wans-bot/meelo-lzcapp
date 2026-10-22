/**
 * Meelo 免密登录注入（browser 阶段）
 *
 * 上游 Meelo 前端把 JWT 放在普通 cookie（键名 access_token）里，SSR 与客户端都读它，
 * 所以只要这个 cookie 存在且有效，打开应用就是已登录状态。
 *
 * 本脚本做三件事，且只在「当前还没有 access_token cookie」时执行：
 *   1. 用注入参数里的账号密码调 POST /api/auth/login；
 *   2. 登录失败（全新实例还没有任何账号）时，调 POST /api/users 建号（首个账号自动是管理员）再登录；
 *   3. 成功拿到 access_token 后写入 cookie 并刷新一次页面。
 *
 * 账号密码来自 lzc-manifest.yml 的 inject params（部署参数渲染），不写死在脚本里。
 */
(() => {
  const KEY = "access_token";
  const params = (typeof ctx !== "undefined" && ctx && ctx.params) || {};
  const username = params.username;
  const password = params.password;

  if (!username || !password) return;
  if (window.__meeloAutologinRunning) return;
  window.__meeloAutologinRunning = true;

  const hasCookie = document.cookie
    .split(";")
    .map((c) => c.trim())
    .some((c) => c.startsWith(KEY + "=") && c.length > KEY.length + 1);
  if (hasCookie) return;

  const call = async (path, body) => {
    const res = await fetch("/api" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
    return res;
  };

  const run = async () => {
    const body = { username, password };
    let res = await call("/auth/login", body);
    if (!res.ok) {
      // 全新实例：先注册首个账号（Meelo 的首个账号自动获得管理员权限）
      await call("/users", { name: username, password });
      res = await call("/auth/login", body);
    }
    if (!res.ok) return;
    let token = "";
    try {
      const json = await res.json();
      token = json && json.access_token ? String(json.access_token) : "";
    } catch (err) {
      token = "";
    }
    if (!token) return;
    const maxAge = 60 * 60 * 24 * 30;
    document.cookie =
      KEY + "=" + token + "; path=/; max-age=" + maxAge + "; SameSite=Lax";
    // 前端在 hydration 时读 cookie，刷新一次让登录态生效
    location.reload();
  };

  run().catch(() => {
    window.__meeloAutologinRunning = false;
  });
})();
