import { lazy, Suspense } from "preact/compat";
import { useEffect } from "preact/hooks";
import { IconSprite } from "./components/Icon";
import { InstallSheet } from "./components/InstallSheet";
import { ToastHost } from "./components/Toast";
import { match, path } from "./lib/router";
import { refreshBulkReminder } from "./add/bulk/bulk";
import { loadBase, loadSpots } from "./lib/store";

const MapPage = lazy(() => import("./pages/MapPage"));
const AddPage = lazy(() => import("./pages/AddPage"));
const BulkPage = lazy(() => import("./pages/BulkPage"));
const EditPage = lazy(() => import("./pages/EditPage"));
const ThanksPage = lazy(() => import("./pages/ThanksPage"));
const GalleryPage = lazy(() => import("./pages/GalleryPage"));
const StatsPage = lazy(() => import("./pages/StatsPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const SharePage = lazy(() => import("./pages/SharePage"));
const AdminApp = lazy(() => import("./pages/admin/AdminApp"));
const NotFound = lazy(() => import("./pages/NotFound"));
const KitchenSink = import.meta.env.DEV ? lazy(() => import("./pages/dev/KitchenSink")) : null;

function Routes() {
  const p = path.value;
  const spot = match("/s/:id", p);
  if (match("/", p) || spot) return <MapPage spotId={spot?.id} />;
  if (match("/nuevo", p)) return <AddPage />;
  if (match("/nuevo/varias", p)) return <BulkPage />;
  const edit = match("/editar/:id", p);
  if (edit) return <EditPage id={edit.id!} />;
  const thanks = match("/gracias/:id", p);
  if (thanks) return <ThanksPage id={thanks.id!} />;
  if (match("/galeria", p)) return <GalleryPage />;
  if (match("/stats", p)) return <StatsPage />;
  const person = match("/p/:name", p);
  if (person) return <ProfilePage name={person.name!} />;
  if (match("/compartir", p)) return <SharePage />;
  if (p.startsWith("/admin")) return <AdminApp />;
  if (KitchenSink && match("/dev/kitchen-sink", p)) return <KitchenSink />;
  return <NotFound />;
}

export function App() {
  useEffect(() => { void loadBase(); void loadSpots(); void refreshBulkReminder(); }, []);
  return (
    <>
      <IconSprite />
      <ToastHost />
      <InstallSheet />
      <Suspense fallback={null}><Routes /></Suspense>
    </>
  );
}
