import type { ComponentType } from "react";
import * as Icons from "lucide-react";
import { NavLink } from "react-router";
import { NAV_SECTIONS_ORDER, ROUTES } from "../routes";
import { strings } from "../../shared/strings";

function iconComponent(iconName: string): ComponentType<{ size?: number }> {
  const pascalCase = iconName
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("") as keyof typeof Icons;
  return (Icons[pascalCase] ?? Icons.HelpCircle) as ComponentType<{ size?: number }>;
}

export function Sidebar() {
  return (
    <nav className="sidebar-nav" id="sidebarNav" aria-label="Navegação principal">
      {NAV_SECTIONS_ORDER.map((sectionKey) => {
        const sectionRoutes = ROUTES.filter((route) => !route.hidden && route.section === sectionKey);
        if (!sectionRoutes.length) return null;

        return (
          <section className="nav-section" key={sectionKey} data-nav-section={sectionKey}>
            <p className="nav-section-label">{strings.nav_sections[sectionKey]}</p>
            {sectionRoutes.map((route) => {
              const Icon = iconComponent(route.icon);
              const label = strings.nav[route.navKey] ?? route.id;
              return (
                <NavLink
                  key={route.id}
                  to={`/${route.id}`}
                  className={({ isActive }) => `nav-link${isActive ? " is-active" : ""}`}
                  aria-label={label}
                >
                  <Icon size={18} />
                  <span className="nav-label">{label}</span>
                </NavLink>
              );
            })}
          </section>
        );
      })}
    </nav>
  );
}
