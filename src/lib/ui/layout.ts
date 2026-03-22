export type AppViewId = "overview" | "tasks" | "board" | "review" | "detail" | "live" | "analytics";

export type LayoutNavItem = Readonly<{
  view: AppViewId;
  label: string;
  subtitle: string;
  icon: LayoutIcon;
  active?: boolean;
}>;

type LayoutIcon = "dashboard" | "board" | "review" | "stream" | "team" | "analytics" | "detail" | "settings" | "integrations" | "profile" | "search" | "menu" | "close" | "bell" | "chevron";

function iconSvg(icon: LayoutIcon): string {
  const common = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  if (icon === "dashboard") return `<svg ${common}><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="5" rx="2" /><rect x="13" y="10" width="8" height="11" rx="2" /><rect x="3" y="13" width="8" height="8" rx="2" /></svg>`;
  if (icon === "board") return `<svg ${common}><rect x="3" y="5" width="6" height="14" rx="2" /><rect x="10" y="5" width="6" height="8" rx="2" /><rect x="17" y="5" width="4" height="14" rx="2" /></svg>`;
  if (icon === "review") return `<svg ${common}><path d="M4 12h7" /><path d="m9 7 5 5-5 5" /><rect x="14" y="4" width="7" height="16" rx="2" /></svg>`;
  if (icon === "stream") return `<svg ${common}><circle cx="6" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="18" cy="12" r="1.8" /><path d="M2 12h1" /><path d="M21 12h1" /></svg>`;
  if (icon === "team") return `<svg ${common}><circle cx="8" cy="9" r="3" /><circle cx="17" cy="8" r="2.5" /><path d="M3.5 19a4.5 4.5 0 0 1 9 0" /><path d="M14 19a3.7 3.7 0 0 1 7.4 0" /></svg>`;
  if (icon === "analytics") return `<svg ${common}><path d="M4 19V9" /><path d="M10 19V5" /><path d="M16 19v-7" /><path d="M22 19V3" /></svg>`;
  if (icon === "detail") return `<svg ${common}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8" /><path d="M8 11h8" /><path d="M8 15h5" /></svg>`;
  if (icon === "settings") return `<svg ${common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.8 1.8 0 0 0 .3 2l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.8 1.8 0 0 0-2-.3 1.8 1.8 0 0 0-1 1.6V21a2 2 0 0 1-4 0v-.2a1.8 1.8 0 0 0-1-1.6 1.8 1.8 0 0 0-2 .3l-.1.1A2 2 0 0 1 3.9 17l.1-.1a1.8 1.8 0 0 0 .3-2 1.8 1.8 0 0 0-1.6-1H2.5a2 2 0 0 1 0-4h.2a1.8 1.8 0 0 0 1.6-1 1.8 1.8 0 0 0-.3-2l-.1-.1A2 2 0 1 1 6.7 4l.1.1a1.8 1.8 0 0 0 2 .3h.1a1.8 1.8 0 0 0 1-1.6V2.5a2 2 0 0 1 4 0v.2a1.8 1.8 0 0 0 1 1.6h.1a1.8 1.8 0 0 0 2-.3l.1-.1A2 2 0 0 1 20.1 6l-.1.1a1.8 1.8 0 0 0-.3 2v.1a1.8 1.8 0 0 0 1.6 1h.2a2 2 0 0 1 0 4h-.2a1.8 1.8 0 0 0-1.6 1z" /></svg>`;
  if (icon === "integrations") return `<svg ${common}><path d="M7 7h4v4H7z" /><path d="M13 7h4v4h-4z" /><path d="M7 13h4v4H7z" /><path d="M13 13h4v4h-4z" /></svg>`;
  if (icon === "profile") return `<svg ${common}><circle cx="12" cy="8" r="3.2" /><path d="M5 19a7 7 0 0 1 14 0" /></svg>`;
  if (icon === "search") return `<svg ${common}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>`;
  if (icon === "menu") return `<svg ${common}><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></svg>`;
  if (icon === "close") return `<svg ${common}><path d="m6 6 12 12" /><path d="m18 6-12 12" /></svg>`;
  if (icon === "bell") return `<svg ${common}><path d="M15 17H5.5a1 1 0 0 1-.8-1.6l1-1.4V10a6.3 6.3 0 0 1 5.5-6.3A6 6 0 0 1 18 9.7V14l1.1 1.4a1 1 0 0 1-.8 1.6H15" /><path d="M9.5 19a2.5 2.5 0 0 0 5 0" /></svg>`;
  return `<svg ${common}><path d="m9 6 6 6-6 6" /></svg>`;
}

function renderMainNavigation(items: readonly LayoutNavItem[]): string {
  return items.map((item) => {
    const isActive = item.active ? " active" : "";
    const current = item.active ? ' aria-current="page"' : "";
    return [
      `<button type="button" data-view="${item.view}" class="nav-link${isActive}"${current}>`,
      `<span class="nav-icon" aria-hidden="true">${iconSvg(item.icon)}</span>`,
      '<span class="nav-copy">',
      `<span class="nav-label">${item.label}</span>`,
      `<span class="nav-sub">${item.subtitle}</span>`,
      "</span>",
      "</button>",
    ].join("");
  }).join("");
}

function renderUtilityLink(icon: LayoutIcon, label: string): string {
  return [
    '<a href="#" class="utility-link" role="button">',
    `<span class="utility-icon" aria-hidden="true">${iconSvg(icon)}</span>`,
    `<span>${label}</span>`,
    "</a>",
  ].join("");
}

export function buildSidebar(versionLabel = "v5.0.0 • build local"): string {
  const primaryNav: LayoutNavItem[] = [
    { view: "overview", label: "Dashboard", subtitle: "Mission dashboard", icon: "dashboard", active: true },
    { view: "board", label: "Task Board", subtitle: "Pipeline operacional", icon: "board" },
    { view: "review", label: "Review Queue", subtitle: "Decisões humanas", icon: "review" },
    { view: "live", label: "Live Stream", subtitle: "Eventos em tempo real", icon: "stream" },
    { view: "tasks", label: "Team / Agents", subtitle: "Equipe e ownership", icon: "team" },
  ];

  const secondaryNav: LayoutNavItem[] = [
    { view: "analytics", label: "Analytics", subtitle: "Custos e throughput", icon: "analytics" },
    { view: "detail", label: "Task Detail", subtitle: "Inspeção granular", icon: "detail" },
  ];

  return [
    '<aside class="side-rail" id="app-sidebar" aria-label="SYNX operational sidebar">',
    '<div class="rail-top">',
    '<div class="brand-block">',
    '<div class="brand-mark" aria-hidden="true">SX</div>',
    '<div class="brand-copy">',
    '<strong>SYNX Mission Control</strong>',
    `<span class="build-version">${versionLabel}</span>`,
    "</div>",
    "</div>",
    '<button type="button" class="icon-btn sidebar-close" data-sidebar-close aria-label="Close navigation">' + iconSvg("close") + "</button>",
    "</div>",
    '<section class="rail-panel">',
    '<div class="theme-switch" role="group" aria-label="Theme mode">',
    '<button type="button" class="theme-btn" data-theme-option="light">Light</button>',
    '<button type="button" class="theme-btn active" data-theme-option="system" aria-pressed="true">System</button>',
    '<button type="button" class="theme-btn" data-theme-option="dark">Dark</button>',
    "</div>",
    '<div class="badge" id="poll-status" role="status" aria-live="polite" aria-atomic="true">Realtime connecting...</div>',
    "</section>",
    '<section id="review-hotspot" class="rail-panel review-hotspot" hidden>',
    "<strong>Human Review Pending</strong>",
    '<div id="review-hotspot-meta" class="muted">No tasks waiting right now.</div>',
    '<div class="actions"><button type="button" class="btn approve" data-open-review>Open review queue</button></div>',
    "</section>",
    '<nav class="view-nav sidebar-nav" aria-label="SYNX Web UI sections">',
    renderMainNavigation(primaryNav),
    '<div class="nav-divider"></div>',
    renderMainNavigation(secondaryNav),
    "</nav>",
    '<div class="sidebar-bottom">',
    renderUtilityLink("settings", "Settings"),
    renderUtilityLink("integrations", "Integrations"),
    renderUtilityLink("profile", "Profile"),
    "</div>",
    "</aside>",
  ].join("");
}

export function buildHeader(): string {
  return [
    '<header class="workspace-header app-header">',
    '<div class="header-left">',
    '<button type="button" class="icon-btn sidebar-toggle" data-sidebar-toggle aria-label="Open navigation">' + iconSvg("menu") + "</button>",
    '<div class="header-title">',
    '<div class="header-breadcrumb">Mission Control / <span id="header-view-key">Dashboard</span></div>',
    '<h1 id="header-screen-title">Mission Dashboard</h1>',
    "</div>",
    "</div>",
    '<label class="global-search" for="global-search-input">',
    '<span class="search-icon" aria-hidden="true">' + iconSvg("search") + "</span>",
    '<input id="global-search-input" class="field-input" autocomplete="off" placeholder="Buscar tarefas, agentes, eventos ou IDs..." />',
    "</label>",
    '<div class="header-right">',
    '<button type="button" class="btn" data-open-command-palette>Busca</button>',
    '<div id="connectivity-indicator" class="connectivity-chip is-online" role="status" aria-live="polite">',
    '<span class="dot" aria-hidden="true"></span>',
    '<span id="connectivity-label">Online</span>',
    "</div>",
    '<button type="button" class="icon-btn notif-btn" aria-label="Notifications">',
    iconSvg("bell"),
    '<span id="header-notif-count" class="notif-count">0</span>',
    "</button>",
    '<div id="runtime-status-pill" class="runtime-chip">Local LLM: Active</div>',
    "</div>",
    "</header>",
  ].join("");
}

export function buildMainLayout(params: Readonly<{ sidebar: string; header: string; content: string }>): string {
  return [
    '<main id="main-content" class="app-shell" data-app-shell>',
    '<button type="button" class="sidebar-backdrop" data-sidebar-close aria-label="Close navigation panel"></button>',
    params.sidebar,
    '<section class="workspace">',
    params.header,
    '<div class="workspace-scroll">',
    params.content,
    "</div>",
    "</section>",
    "</main>",
  ].join("");
}
