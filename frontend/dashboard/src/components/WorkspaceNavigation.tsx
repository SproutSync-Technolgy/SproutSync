import { useEffect, useId, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ChevronDown, type LucideIcon } from "lucide-react";

type NavigationItem = { key: string; title: string; icon: LucideIcon };

export function WorkspaceNavigation({
  items, page, alertCount, onNavigate, surface,
}: {
  items: NavigationItem[];
  page: string;
  alertCount: number;
  onNavigate: (page: string) => void;
  surface: "sidebar" | "mobile";
}) {
  const reduceMotion = useReducedMotion();
  const id = useId();
  const sections = [
    { title: "", keys: ["home"] },
    { title: items.some((item) => item.key === "irrigation") ? "Production" : "Review", keys: ["production", "irrigation", "evidence"] },
    { title: "Monitoring", keys: ["readings", "alerts"] },
    { title: "Administration", keys: ["accounts", "audit"] },
    { title: "", keys: ["system"] },
  ];
  const [collapsed, setCollapsed] = useState<string[]>([]);
  useEffect(() => {
    // A shortcut into a section must also reveal its current navigation item.
    const section = sections.find((section) => section.keys.includes(page));
    if (section) setCollapsed((current) => current.filter((title) => title !== section.title));
  }, [page]);

  const renderItem = (item: NavigationItem) => (
    <button
      type="button"
      key={item.key}
      onClick={() => onNavigate(item.key)}
      aria-current={page === item.key ? "page" : undefined}
      className={`workspace-nav-item${page === item.key ? " selected" : ""}`}
    >
      {page === item.key && (
        <motion.span
          aria-hidden="true"
          className="workspace-nav-highlight"
          layoutId={`${id}-${surface}-active`}
          transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36 }}
        />
      )}
      <item.icon size={18} aria-hidden="true" />
      <span className="workspace-nav-label">{item.title}</span>
      {item.key === "alerts" && alertCount > 0 && (
        <span className="nav-count" aria-label={`${alertCount} active alerts`}>{alertCount}</span>
      )}
    </button>
  );

  return (
    <nav className="workspace-navigation" aria-label={surface === "sidebar" ? "Main navigation" : "All workspace pages"}>
      {sections.map((section, index) => {
        const children = section.keys.flatMap((key) => items.filter((item) => item.key === key));
        if (!children.length) return null;
        if (!section.title) return <div key={index}>{children.map(renderItem)}</div>;
        const expanded = !collapsed.includes(section.title);
        const sectionId = `${id}-section-${index}`;
        const containsCurrent = children.some((item) => item.key === page);
        return (
          <div className="workspace-nav-section" key={section.title}>
            <button
              type="button"
              className="workspace-nav-section-toggle"
              aria-expanded={expanded}
              aria-controls={sectionId}
              onClick={() => setCollapsed((current) => expanded ? [...current, section.title] : current.filter((title) => title !== section.title))}
            >
              <span>{section.title}</span>
              {!expanded && containsCurrent && <span className="workspace-nav-current-dot" aria-label="Contains current page" />}
              <ChevronDown size={14} aria-hidden="true" className={expanded ? "expanded" : ""} />
            </button>
            <div id={sectionId} className="workspace-nav-section-content" hidden={!expanded}>
              {children.map(renderItem)}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
