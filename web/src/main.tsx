import "@fontsource-variable/onest";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/landing.css";
import "./styles/studio.css";

import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import { I18nProvider, useI18n } from "./i18n";
import { RouterProvider, useRouter } from "./lib/router";
import Landing from "./pages/Landing";

const Studio = lazy(() => import("./pages/Studio"));

function App() {
  const { path } = useRouter();
  const { t } = useI18n();
  return (
    <>
      <a className="skip-link" href="#main">{t.nav.skip}</a>
      {path.startsWith("/studio") ? (
        <Suspense fallback={<div className="studio" />}>
          <Studio />
        </Suspense>
      ) : (
        <Landing />
      )}
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <I18nProvider>
        <RouterProvider>
          <App />
        </RouterProvider>
      </I18nProvider>
    </MotionConfig>
  </StrictMode>,
);
