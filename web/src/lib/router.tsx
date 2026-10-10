import { createContext, useCallback, useContext, useEffect, useState, type MouseEvent, type ReactNode } from "react";

// A two-route app does not need a router library: history API + one context.
type Router = { path: string; navigate: (to: string) => void };
const Ctx = createContext<Router | null>(null);

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((to: string) => {
    const url = new URL(to, window.location.origin);
    if (url.pathname === window.location.pathname && url.hash) {
      document.getElementById(url.hash.slice(1))?.scrollIntoView();
      return;
    }
    window.history.pushState(null, "", url.pathname + url.search + url.hash);
    setPath(url.pathname);
    if (url.hash) requestAnimationFrame(() => document.getElementById(url.hash.slice(1))?.scrollIntoView());
    else window.scrollTo({ top: 0 });
  }, []);

  return <Ctx.Provider value={{ path, navigate }}>{children}</Ctx.Provider>;
}

export function useRouter(): Router {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRouter outside RouterProvider");
  return v;
}

export function Link({ to, className, children, ...rest }: { to: string; className?: string; children: ReactNode } &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const { navigate } = useRouter();
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (to.startsWith("#")) return; // same-page anchor: native behaviour
    e.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} className={className} onClick={onClick} {...rest}>
      {children}
    </a>
  );
}
