import { useEffect, useState } from "preact/hooks";
import { adminApi, type AdminPerson } from "../../admin/api";
import { adminPeople, loadAdminPeople, refreshCounts } from "../../admin/state";
import { errorText, toastError } from "../../admin/util";
import { ApiError } from "../../lib/api";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/Button";
import { type Column, DataTable } from "../../components/DataTable";
import { Dialog } from "../../components/Dialog";
import { EmptyState } from "../../components/EmptyState";
import { TextField } from "../../components/Field";
import { formatInt } from "../../components/StatSticker";
import { cx } from "../../lib/cx";
import { t } from "../../lib/i18n";
import { loadBase } from "../../lib/store";
import { toast } from "../../lib/toast";
import { Modal } from "./Modal";
import { PageHead, SearchBox } from "./parts";

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const total = (p: AdminPerson) => p.placed + p.reported;

/** People (Page12AdminPeople 9e): counts and aliases, rename, and merge. People are never merged on their own: an admin decides. */
export default function PeoplePage() {
  const people = adminPeople.value;
  const [loaded, setLoaded] = useState(people.length > 0);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [merge, setMerge] = useState<AdminPerson[] | null>(null);
  const [keep, setKeep] = useState<number | null>(null);
  const [merging, setMerging] = useState(false);
  const [renaming, setRenaming] = useState<AdminPerson | null>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadAdminPeople().then(() => setLoaded(true));
  }, []);

  const shown = q.trim() ? people.filter((p) => norm(p.name).includes(norm(q.trim())) || p.aliases.some((a) => norm(a).includes(norm(q.trim())))) : people;

  const openMerge = () => {
    const picked = people.filter((p) => selected.has(String(p.id)));
    if (picked.length < 2) {
      toast.show({ kind: "info", message: t("admin.people.pickTwo") });
      return;
    }
    setMerge(picked);
    setKeep([...picked].sort((a, b) => total(b) - total(a) || a.id - b.id)[0]?.id ?? null);
  };

  const confirmMerge = async () => {
    if (!merge || keep === null) return;
    const target = merge.find((p) => p.id === keep);
    if (!target) return;
    setMerging(true);
    try {
      for (const from of merge.filter((p) => p.id !== keep)) await adminApi.mergePeople(from.id, keep);
      toast.show({ kind: "success", message: t("admin.people.merged", { name: target.name }) });
      setMerge(null);
      setSelected(new Set());
    } catch (e) {
      toastError(e);
    } finally {
      setMerging(false);
      await Promise.all([loadAdminPeople(), loadBase()]);
      void refreshCounts();
    }
  };

  const openRename = (p: AdminPerson) => {
    setRenaming(p);
    setName(p.name);
    setNameError("");
  };

  const saveRename = async () => {
    if (!renaming || saving) return;
    const next = name.trim().replace(/\s+/g, " ");
    if (!next) {
      setNameError(t("admin.people.errEmpty"));
      return;
    }
    if (next === renaming.name) {
      setRenaming(null);
      return;
    }
    setSaving(true);
    try {
      await adminApi.renamePerson(renaming.id, next);
      toast.show({ kind: "success", message: t("admin.people.renamed", { from: renaming.name, to: next }) });
      setRenaming(null);
      await Promise.all([loadAdminPeople(), loadBase()]);
    } catch (e) {
      if (e instanceof ApiError && e.code === "name_exists") setNameError(t("admin.people.errExists", { name: next }));
      else toast.show({ kind: "error", message: errorText(e) });
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<AdminPerson>[] = [
    {
      key: "name",
      header: t("admin.people.colName"),
      cell: (p) => (
        <span class="mp-admin-person">
          <Avatar name={p.name} size={28} />
          <b style="color:var(--ink-strong)">{p.name}</b>
        </span>
      ),
    },
    {
      key: "aliases",
      header: t("admin.people.colAliases"),
      cell: (p) => {
        const others = p.aliases.filter((a) => a !== p.name);
        return others.length ? <span class="mp-admin-aliases">{others.join(", ")}</span> : <span class="mp-admin-muted">{t("admin.people.noAliases")}</span>;
      },
    },
    { key: "placed", header: t("admin.people.colPlaced"), numeric: true, cell: (p) => formatInt(p.placed) },
    { key: "reported", header: t("admin.people.colReported"), numeric: true, cell: (p) => formatInt(p.reported) },
    {
      key: "actions",
      header: "",
      cell: (p) => (
        <Button size="sm" variant="quiet" icon="pencil" onClick={() => openRename(p)} aria-label={t("admin.people.renameFor", { name: p.name })}>
          {t("admin.people.rename")}
        </Button>
      ),
    },
  ];

  const mergeFrom = merge?.filter((p) => p.id !== keep) ?? [];
  const affected = mergeFrom.reduce((sum, p) => sum + total(p), 0);
  const target = merge?.find((p) => p.id === keep);

  return (
    <>
      <PageHead title={t("admin.people.title")} />
      <div class="mp-admin__body mp-admin-pad">
        <p class="mp-field__hint">{t("admin.people.intro")}</p>
        <DataTable<AdminPerson>
          label={t("admin.people.title")}
          columns={columns}
          rows={shown}
          rowKey={(p) => String(p.id)}
          rowLabel={(p) => p.name}
          loading={!loaded}
          empty={<EmptyState icon="/img/icons/papa.png" title={t("common.empty.filter")} />}
          selectable
          selected={selected}
          onSelectionChange={setSelected}
          toolbar={<SearchBox value={q} onInput={setQ} label={t("admin.people.search")} placeholder={t("admin.people.search")} />}
          bulkActions={
            <Button size="sm" variant="secondary" icon="merge" onClick={openMerge}>
              {t("admin.people.merge")}
            </Button>
          }
        />
      </div>

      <Dialog
        open={merge !== null}
        role="alertdialog"
        title={t("admin.people.mergeTitle")}
        onClose={() => setMerge(null)}
        art={
          <div class="mp-admin-radios" role="radiogroup" aria-label={t("admin.people.keepLabel")}>
            {merge?.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={keep === p.id} class={cx("mp-radio", keep === p.id && "is-on")} onClick={() => setKeep(p.id)}>
                <span class="mp-radio__dot" aria-hidden="true" />
                <Avatar name={p.name} size={28} />
                <b>{p.name}</b>
                <span class="mp-field__hint mp-radio__meta">{t("admin.people.stickersOf", { n: total(p) })}</span>
              </button>
            ))}
          </div>
        }
        actions={
          <>
            <Button variant="primary" icon="merge" loading={merging} onClick={() => void confirmMerge()}>
              {merging ? t("admin.people.merging") : t("admin.people.mergeConfirm", { name: target?.name ?? "" })}
            </Button>
            <Button variant="secondary" onClick={() => setMerge(null)}>
              {t("admin.confirm.no")}
            </Button>
          </>
        }
      >
        {t("admin.people.mergeBody", { n: affected, names: mergeFrom.map((p) => p.name).join(", ") })}
      </Dialog>

      <Modal
        open={renaming !== null}
        title={t("admin.people.renameTitle", { name: renaming?.name ?? "" })}
        onClose={() => setRenaming(null)}
        actions={
          <>
            <Button variant="primary" icon="check" loading={saving} onClick={() => void saveRename()}>
              {t("common.action.save")}
            </Button>
            <Button variant="secondary" onClick={() => setRenaming(null)}>
              {t("common.action.cancel")}
            </Button>
          </>
        }
      >
        <form onSubmit={(e) => { e.preventDefault(); void saveRename(); }}>
          <TextField
            label={t("admin.people.newName")}
            value={name}
            maxLength={255}
            error={nameError || undefined}
            hint={t("admin.people.renameHint")}
            onInput={(e) => {
              setName((e.currentTarget as HTMLInputElement).value);
              setNameError("");
            }}
          />
        </form>
      </Modal>
    </>
  );
}
