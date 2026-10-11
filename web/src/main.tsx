import "@fontsource-variable/onest";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/landing.css";
import "./styles/studio.css";

import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { I18nProvider, useI18n } from "./i18n";
import { RouterProvider, useRouter } from "./lib/router";
import Landing from "./pages/Landing";

const Studio = lazy(() => import("./pages/Studio"));

function App() {
  const { path } = useRouter();
  const { t } = useI18n();
  const studio = path.startsWith("/studio");
  return (
    <>
      <a className="skip-link" href="#main">{t.nav.skip}</a>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={studio ? "studio" : "landing"} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35, ease: [0.2, 0.7, 0, 1] }}>
          {studio ? (
            <Suspense fallback={<div className="studio" />}>
              <Studio />
            </Suspense>
          ) : (
            <Landing />
          )}
        </motion.div>
      </AnimatePresence>
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
