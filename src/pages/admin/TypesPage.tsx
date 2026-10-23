import { useCallback, useEffect, useState } from "preact/hooks";
import { adminApi, fetchAllSpots, type AdminType } from "../../admin/api";
import { adminTypes, loadAdminTypes, refreshCounts } from "../../admin/state";
import { groupCounts } from "../../admin/text";
import { attempt } from "../../admin/util";
import { Badge } from "../../components/Badge";
import { Button, IconButton } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { TypeSticker } from "../../components/map-parts";
import { formatInt } from "../../components/StatSticker";
import { t } from "../../lib/i18n";
import { loadBase } from "../../lib/store";
import { toast } from "../../lib/toast";
import { PageHead } from "./parts";
import { TypeFormModal, type TypeFormMode } from "./TypeForm";

interface OtherGroup { text: string; count: number }

/** Sticker types (Page11AdminData 9d): order, activate, edit, add, and promote an "Otro" value to a type. */
export default function TypesPage() {
  const types = adminTypes.value;
  const [mode, setMode] = useState<TypeFormMode | null>(null);
  const [groups, setGroups] = useState<OtherGroup[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(types.length > 0);

  useEffect(() => {
    void loadAdminTypes().then(() => setLoaded(true));
  }, []);

  // The free-text values people typed under a type that asks for text ("Otro: vaca"), grouped.
  const loadGroups = useCallback(async () => {
    const withText = adminTypes.value.filter((x) => x.allows_text);
    try {
      const lists = await Promise.all(withText.map((x) => fetchAllSpots({ type: x.slug })));
      setGroups(groupCounts(lists.flat().map((s) => s.other_text ?? "")));
    } catch {
      setGroups([]);
    }
  }, []);
  useEffect(() => {
    if (loaded) void loadGroups();
  }, [loaded, loadGroups, types.length]);

  const refresh = async () => {
    await Promise.all([loadAdminTypes(), loadBase()]);
    void refreshCounts();
  };

  const update = async (type: AdminType, fields: Record<string, string>, message: string) => {
    setBusy(type.slug);
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    const ok = await attempt(() => adminApi.updateType(type.slug, form));
    setBusy(null);
    if (!ok) return;
    await refresh();
    toast.show({ kind: "success", message });
  };

  /** Swap with the neighbour. Equal orders are renumbered so the swap always shows. */
  const move = async (type: AdminType, delta: -1 | 1) => {
    const list = [...types].sort((a, b) => a.sort_order - b.sort_order || a.slug.localeCompare(b.slug));
    const at = list.findIndex((x) => x.slug === type.slug);
    const other = list[at + delta];
    if (!other) return;
    list[at] = other;
    list[at + delta] = type;
    setBusy(type.slug);
    const changes = list.map((x, i) => ({ x, order: i + 1 })).filter(({ x, order }) => x.sort_order !== order);
    for (const { x, order } of changes) {
      const form = new FormData();
      form.set("sort_order", String(order));
      const ok = await attempt(() => adminApi.updateType(x.slug, form));
      if (!ok) break;
    }
    setBusy(null);
    await refresh();
    toast.show({ kind: "success", message: t("admin.types.moved", { label: type.label }) });
  };

  const ordered = [...types].sort((a, b) => a.sort_order - b.sort_order || a.slug.localeCompare(b.slug));

  return (
    <>
      <PageHead title={t("admin.types.title")}>
        <Button size="sm" variant="primary" icon="plus" onClick={() => setMode({ kind: "new" })}>
          {t("admin.types.new")}
        </Button>
      </PageHead>

      <div class="mp-admin__body mp-admin-pad">
        <p class="mp-field__hint">{t("admin.types.intro")}</p>

        <div class="mp-admin-tablewrap">
          <table class="mp-table">
            <caption class="mp-sr">{t("admin.types.title")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("admin.types.colOrder")}</th>
                <th scope="col">{t("admin.types.colIcon")}</th>
                <th scope="col">{t("admin.types.colName")}</th>
                <th scope="col">{t("admin.types.colColor")}</th>
                <th scope="col">{t("admin.types.colActive")}</th>
                <th scope="col">{t("admin.types.colCount")}</th>
                <th scope="col">
                  <span class="mp-sr">{t("admin.types.colActions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((x, i) => (
                <tr key={x.slug}>
                  <td>
                    <span class="mp-admin-order">
                      <IconButton icon="chevron-up" size="sm" variant="quiet" label={t("admin.types.up", { label: x.label })} disabled={i === 0 || busy !== null} onClick={() => void move(x, -1)} />
                      <span class="mp-num">{x.sort_order}</span>
                      <IconButton icon="chevron-down" size="sm" variant="quiet" label={t("admin.types.down", { label: x.label })} disabled={i === ordered.length - 1 || busy !== null} onClick={() => void move(x, 1)} />
                    </span>
                  </td>
                  <td>
                    <TypeSticker type={x} tilt={`var(--tilt-${(i % 4) + 1})`} class="mp-admin-typeicon" />
                  </td>
                  <td>
                    <b style="color:var(--ink-strong)">{x.label}</b>
                    <span class="mp-admin-slug">{x.slug}</span>
                    {x.allows_text && <Badge icon="note">{t("admin.types.asksText")}</Badge>}
                  </td>
                  <td>
                    <span class="mp-swatch mp-admin-swatch" style={`background:${x.color}`} title={x.color} />
                  </td>
                  <td>
                    <button
                      type="button"
                      class="mp-switch"
                      role="switch"
                      aria-checked={x.is_active}
                      aria-label={t("admin.types.activeFor", { label: x.label })}
                      disabled={busy === x.slug}
                      onClick={() => void update(x, { is_active: x.is_active ? "" : "1" }, t(x.is_active ? "admin.types.off" : "admin.types.on", { label: x.label }))}
                    />
                  </td>
                  <td class="mp-num">{formatInt(x.count)}</td>
                  <td>
                    <Button size="sm" variant="quiet" icon="pencil" onClick={() => setMode({ kind: "edit", type: x })}>
                      {t("common.action.edit")}
                    </Button>
                  </td>
                </tr>
              ))}
              {loaded && ordered.length === 0 && (
                <tr>
                  <td colSpan={7}>{t("admin.types.empty")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <section class="mp-card mp-admin-promote" aria-labelledby="promote-title">
          <h2 class="mp-card__title" id="promote-title">
            {t("admin.types.promoteHead")}
          </h2>
          <p class="mp-field__hint">{t("admin.types.promoteIntro")}</p>
          {groups === null ? (
            <span class="mp-field__hint">{t("admin.types.promoteLoading")}</span>
          ) : groups.length === 0 ? (
            <span class="mp-field__hint">{t("admin.types.promoteNone")}</span>
          ) : (
            <ul class="mp-admin-promote__list">
              {groups.map((g) => (
                <li key={g.text}>
                  <Icon name="tag" />
                  <span>
                    <b>{g.text}</b> <span class="mp-field__hint">{t("admin.types.promoteCount", { n: g.count })}</span>
                  </span>
                  <Button size="sm" variant="secondary" icon="merge" onClick={() => setMode({ kind: "promote", text: g.text, count: g.count })}>
                    {t("admin.types.promote")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <TypeFormModal mode={mode} onClose={() => setMode(null)} />
    </>
  );
}
