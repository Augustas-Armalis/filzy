import { Link, NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/cn";

const links = [
  { to: "/", label: "Home" },
  { to: "/about", label: "About" },
];

/*
  App shell: a small top nav that stays put while the routed page renders
  into <Outlet />.
*/
export function Layout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <nav className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link to="/" className="font-bold">
            Filzy
          </Link>
          <div className="flex gap-1">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "rounded-lg px-3 py-1.5 text-sm transition-colors hover:bg-muted",
                    isActive
                      ? "font-semibold text-primary"
                      : "text-muted-foreground"
                  )
                }
              >
                {l.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="mx-auto max-w-3xl px-6 py-10 text-sm text-muted-foreground">
        Filzy — React + Tailwind + Framer Motion.
      </footer>
    </div>
  );
}
