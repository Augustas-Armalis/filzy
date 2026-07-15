import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeftRight,
  Download,
  Minimize2,
  Send,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/cn";

const LINKS = [
  { to: "/", label: "Send", Icon: Send, end: true },
  { to: "/convert", label: "Convert", Icon: ArrowLeftRight },
  { to: "/compress", label: "Compress", Icon: Minimize2 },
  { to: "/extract", label: "Extract", Icon: Download },
];

const iconProps = {
  size: 14,
  strokeWidth: 1.17,
  absoluteStrokeWidth: true,
  "aria-hidden": true,
};

function ToolLink({ item, mobile = false, onClick }) {
  const { Icon } = item;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          "group flex cursor-pointer touch-manipulation items-center text-[14px] transition-[background-color,color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/25",
          mobile
            ? "h-[40px] w-full gap-[10px] rounded-[10px] px-[12px]"
            : "h-[32px] gap-[7px] rounded-[9px] px-[11px]",
          isActive
            ? "bg-[#EEF0F1] text-text shadow-[inset_0_0_0_1px_rgba(5,5,5,0.03)]"
            : "text-alt-text hover:bg-white-hover hover:text-text",
        )
      }
    >
      <Icon {...iconProps} />
      <span>{item.label}</span>
    </NavLink>
  );
}

function FollowLink({ mobile = false }) {
  return (
    <a
      href="https://www.instagram.com/filzy.site/"
      target="_blank"
      rel="noreferrer"
      className={cn(
        "flex cursor-pointer items-center justify-center rounded-[9px] bg-text text-[14px] text-white transition-colors duration-150 hover:bg-text-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/25 focus-visible:ring-offset-2",
        mobile ? "h-[32px] px-[13px]" : "h-[32px] px-[13px]",
      )}
    >
      Follow
    </a>
  );
}

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const mobileMenuRef = useRef(null);
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const closeOnPointerDown = (event) => {
      if (!mobileMenuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  return (
    <nav
      aria-label="Main navigation"
      className="pointer-events-auto fixed left-[10px] right-[10px] top-[10px] z-30 flex items-center justify-between lg:left-4 lg:right-4 lg:top-4"
    >
      <Logo />

      <div className="hidden h-[40px] items-center gap-[2px] rounded-[13px] bg-white p-[4px] shadow-[0_8px_30px_rgba(0,0,0,0.08)] lg:flex">
        {LINKS.map((item) => (
          <ToolLink key={item.to} item={item} />
        ))}
        <FollowLink />
      </div>

      <div ref={mobileMenuRef} className="relative lg:hidden">
        <div className="flex h-[40px] items-center gap-[3px] rounded-[13px] bg-white p-[4px] shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
          <FollowLink mobile />
          <button
            type="button"
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMenuOpen((open) => !open)}
            className="flex h-[32px] w-[32px] cursor-pointer items-center justify-center rounded-[9px] text-text transition-colors duration-150 hover:bg-white-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/25"
          >
            <motion.span
              aria-hidden="true"
              animate={{ rotate: menuOpen ? 90 : 0 }}
              transition={{ type: "spring", stiffness: 310, damping: 24, mass: 0.65 }}
              className="relative block h-[14px] w-[14px]"
            >
              <motion.span
                animate={{ y: menuOpen ? 5.5 : 0, rotate: menuOpen ? 45 : 0 }}
                transition={{ type: "spring", stiffness: 360, damping: 25, mass: 0.55 }}
                className="absolute left-0 top-[1px] h-[1.17px] w-[14px] rounded-full bg-current"
              />
              <motion.span
                animate={{ opacity: menuOpen ? 0 : 1, scaleX: menuOpen ? 0.25 : 1 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="absolute left-0 top-[6.5px] h-[1.17px] w-[14px] origin-center rounded-full bg-current"
              />
              <motion.span
                animate={{ y: menuOpen ? -5.5 : 0, rotate: menuOpen ? -45 : 0 }}
                transition={{ type: "spring", stiffness: 360, damping: 25, mass: 0.55 }}
                className="absolute bottom-[1px] left-0 h-[1.17px] w-[14px] rounded-full bg-current"
              />
            </motion.span>
          </button>
        </div>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              id="mobile-navigation"
              initial={{ opacity: 0, y: -7, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -5, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
              className="absolute right-0 top-[46px] w-[220px] origin-top-right overflow-hidden rounded-[14px] border border-border bg-white p-[5px] shadow-[0_18px_50px_rgba(0,0,0,0.16)]"
            >
              {LINKS.map((item, index) => (
                <motion.div
                  key={item.to}
                  initial={{ opacity: 0, x: 5 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.025 * index, duration: 0.16 }}
                >
                  <ToolLink item={item} mobile onClick={() => setMenuOpen(false)} />
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
}
