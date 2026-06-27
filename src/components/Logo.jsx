/*
  Filzy mark (lives in the navbar, left side). Clicking it reloads the app at
  the home page. Logo file: /public/branding/Filzy.svg (auto width, 26px tall).
*/
export function Logo() {
  const reloadHome = (e) => {
    e.preventDefault();
    if (window.location.pathname === "/" && !window.location.hash) {
      window.location.reload();
    } else {
      window.location.href = "/";
    }
  };

  return (
    <a
      href="/"
      onClick={reloadHome}
      aria-label="Filzy — home"
      className="inline-flex shrink-0"
    >
      <img
        src={`${import.meta.env.BASE_URL}branding/Filzy.svg`}
        alt="Filzy"
        className="h-[26px] w-auto"
      />
    </a>
  );
}
