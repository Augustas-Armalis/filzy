/*
  Tool-page positioning inside the persistent app shell. Mobile mirrors Beam:
  vertically centered with the same 60px/44px safe space. If content grows
  taller than the viewport, `safe center` falls back to start instead of
  clipping the top. Convert remains left-aligned on desktop.
*/
export function ToolShell({ children, align = "center" }) {
  return (
    <div
      className={
        align === "left"
          ? "flex flex-1 items-center justify-center px-[10px] pt-[60px] pb-[44px] [align-items:safe_center] [&>*]:pointer-events-auto lg:justify-start lg:p-0 lg:pl-32"
          : "flex flex-1 items-center justify-center px-[10px] pt-[60px] pb-[44px] [align-items:safe_center] [&>*]:pointer-events-auto"
      }
    >
      {children}
    </div>
  );
}
