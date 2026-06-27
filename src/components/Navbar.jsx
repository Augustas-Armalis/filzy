import { Logo } from "@/components/Logo";

/*
  Top bar: the Filzy logo on the left and the nav-bar frame on the right,
  spaced apart and vertically centered. Sits 16px from the top/left/right on
  desktop, 10px on mobile. The white frame is where nav controls will live.
*/
export function Navbar() {
  return (
    <nav className="fixed left-[10px] right-[10px] top-[10px] z-30 flex items-center justify-between lg:left-4 lg:right-4 lg:top-4">
      <Logo />
        <div className="h-[36px] w-hug rounded-[12px] bg-white flex items-center justify-center px-[4px] gap-[4px]">

          <button className="bg-white hover:bg-white-hover transition-all duration-150 h-[28px] px-[10px] rounded-[8px]">
            <p className="text-[14px] text-alt-text">Creating stuff...</p>
          </button>
          <a
            href="https://www.instagram.com/filzy.site/"
            target="_blank"
            rel="noreferrer"
            className="bg-text hover:bg-text-hover transition-all duration-150 h-[28px] cursor-pointer px-[10px] rounded-[8px] flex items-center"
          >
            <p className="text-[14px] text-white">Follow</p>
          </a>
          
          
          
        </div>
    </nav>
  );
}
