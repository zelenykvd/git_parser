import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { fetchPost, updatePost, approvePost, rejectPost, publishPost, translatePost, deletePost, resetPost, uploadMedia, deleteMedia } from "../api";
import StatusBadge from "../components/StatusBadge";
import MediaPreview from "../components/MediaPreview";
import ModelBadge from "../components/ModelBadge";
import Icon from "../components/Icon";

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

export default function PostDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [post, setPost] = useState<any>(null);
  const [editedText, setEditedText] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [actionLoading, setActionLoading] = useState<"approve" | "reject" | "publish" | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"original" | "translation">("original");

  useEffect(() => {
    fetchPost(Number(id)).then((p) => { setPost(p); setEditedText(p.translatedText || ""); }).catch(console.error);
  }, [id]);

  // Publishing runs in the background on the server — poll until it finishes.
  const isPublishing = post?.status === "PUBLISHING";
  useEffect(() => {
    if (!isPublishing) return;
    const timer = setInterval(async () => {
      try {
        const p = await fetchPost(Number(id));
        if (p.status !== "PUBLISHING") {
          setPost(p);
          if (p.status === "APPROVED") {
            setError("Публікація не вдалася — пост повернуто в «Схвалені». Спробуйте ще раз (деталі в логах сервера).");
          }
        }
      } catch { /* transient network error — keep polling */ }
    }, 2500);
    return () => clearInterval(timer);
  }, [isPublishing, id]);

  if (!post) return (
    <div className="space-y-4 animate-fadeIn">
      <div className="skeleton h-6 w-40" />
      <div className="md:grid md:grid-cols-2 md:gap-4 space-y-4 md:space-y-0">
        <div className="skeleton h-56 w-full rounded-card" />
        <div className="skeleton h-56 w-full rounded-card" />
      </div>
    </div>
  );

  async function handleSave() {
    setSaving(true); setError("");
    try { await updatePost(post.id, editedText); setPost({ ...post, translatedText: editedText }); setEditing(false); }
    catch (err: any) { setError(err.message); } finally { setSaving(false); }
  }

  async function handleAction(action: "approve" | "reject" | "publish") {
    setError(""); setActionLoading(action);
    try {
      if (action === "approve") await approvePost(post.id);
      else if (action === "reject") await rejectPost(post.id);
      else await publishPost(post.id);
      setPost(await fetchPost(post.id));
    } catch (err: any) { setError(err.message); }
    finally { setActionLoading(null); }
  }

  async function handleDelete() {
    if (!confirm("Видалити пост?")) return;
    try { await deletePost(post.id); navigate(-1); } catch (err: any) { setError(err.message); }
  }

  async function handleReset() {
    try { await resetPost(post.id); setPost(await fetchPost(post.id)); } catch (err: any) { setError(err.message); }
  }

  async function handleTranslate(force = false) {
    setTranslating(true); setError("");
    try { const u = await translatePost(post.id, force); setPost(u); setEditedText(u.translatedText || ""); }
    catch (err: any) { setError(err.message); } finally { setTranslating(false); }
  }

  async function handleUploadMedia(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    try { await uploadMedia(post.id, file); setPost(await fetchPost(post.id)); } catch (err: any) { setError(err.message); }
    e.target.value = "";
  }

  async function handleDeleteMedia(mediaId: number) {
    if (!confirm("Видалити файл?")) return;
    try { await deleteMedia(mediaId); setPost({ ...post, mediaFiles: post.mediaFiles.filter((m: any) => m.id !== mediaId) }); }
    catch (err: any) { setError(err.message); }
  }

  const originalClean = stripHtml(post.originalText || "");
  const translationClean = stripHtml(post.translatedText || "");
  const panelClass = "bg-card border border-line rounded-card shadow-card overflow-hidden";
  const panelLabel = "text-[10px] font-semibold text-muted uppercase tracking-wider";

  return (
    <div>
      {/* Back */}
      <button onClick={() => navigate(-1)}
        className="press group flex items-center gap-1 -ml-1 pl-1.5 pr-3 py-1.5 rounded-full text-sm text-muted hover:text-ink hover:bg-elev mb-3">
        <Icon name="arrow_back" size={16} className="transition-transform duration-200 ease-tg group-hover:-translate-x-0.5" /> Назад
      </button>

      {/* Header */}
      <div className="flex items-center gap-2.5 mb-4 flex-wrap">
        <h1 className="text-lg sm:text-xl font-semibold tracking-tight">Пост #{post.id}</h1>
        <StatusBadge status={post.status} />
        <span className="text-xs text-muted">{post.channel?.username ? `@${post.channel.username}` : post.channel?.title || ""}</span>
        {post.vaibeCodUrl && (
          <span className="flex items-center gap-1 text-xs">
            <a href={`https://www.vaibecod.com${post.vaibeCodUrl}`} target="_blank" rel="noopener noreferrer"
              className="rounded-full bg-brand-soft text-brand px-2 py-0.5 font-medium hover:brightness-95 transition">UK ↗</a>
            {post.vaibeCodUrlEn && (
              <a href={`https://www.vaibecod.com${post.vaibeCodUrlEn}`} target="_blank" rel="noopener noreferrer"
                className="rounded-full bg-brand-soft text-brand px-2 py-0.5 font-medium hover:brightness-95 transition">EN ↗</a>
            )}
          </span>
        )}
        {post.linkedinUrl && (
          <a href={post.linkedinUrl} target="_blank" rel="noopener noreferrer"
            className="rounded-full bg-info-soft text-info px-2 py-0.5 text-xs font-medium hover:brightness-95 transition">LinkedIn ↗</a>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-danger-soft text-danger text-sm px-3.5 py-2.5 mb-4 animate-popIn">
          <Icon name="error" size={16} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {/* Mobile: tabs / Desktop: side-by-side */}
      <div className="md:hidden flex gap-1 p-1 mb-3 rounded-full bg-elev border border-line">
        {([["original", "Оригінал"], ["translation", "Переклад"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`press flex-1 py-2 rounded-full text-xs font-medium text-center ${
              tab === key ? "bg-card text-ink shadow-card" : "text-muted"
            }`}>
            {label}
          </button>
        ))}
      </div>

      <div className="md:grid md:grid-cols-2 md:gap-4">
        {/* Original */}
        <div className={`${panelClass} ${tab === "original" ? "block" : "hidden"} md:block`}>
          <div className="px-4 py-3 border-b border-line bg-elev/60">
            <span className={panelLabel}>Оригінал</span>
          </div>
          <div className="px-4 py-4 text-sm leading-relaxed text-ink-2 whitespace-pre-wrap break-words max-h-[50vh] overflow-y-auto scrollbar-thin">
            {originalClean}
          </div>
        </div>

        {/* Translation */}
        <div className={`${panelClass} ${tab === "translation" ? "block" : "hidden"} md:block`}>
          <div className="px-4 py-2.5 border-b border-line bg-elev/60 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className={panelLabel}>Переклад</span>
              <ModelBadge model={post.translationModel} />
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {!editing && !post.translatedText && (
                <button onClick={() => handleTranslate(false)} disabled={translating}
                  className="press flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium brand-gradient text-white shadow-brand hover:brightness-105 disabled:opacity-60">
                  <Icon name="translate" size={13} className={translating ? "animate-spin" : ""} />
                  {translating ? "..." : "Перекласти"}
                </button>
              )}
              {!editing && post.translatedText && (
                <button onClick={() => handleTranslate(true)} disabled={translating}
                  className="press flex items-center gap-1 px-2.5 py-1 rounded-full text-xs text-ink-2 bg-card border border-line hover:border-line-2 hover:text-ink disabled:opacity-60">
                  <Icon name="refresh" size={13} className={translating ? "animate-spin" : ""} />
                  {translating ? "..." : "Заново"}
                </button>
              )}
              {!editing && (
                <button onClick={() => setEditing(true)}
                  title="Редагувати"
                  className="press flex items-center justify-center w-7 h-7 rounded-full text-muted hover:text-brand hover:bg-brand-soft">
                  <Icon name="edit" size={14} />
                </button>
              )}
            </div>
          </div>
          <div className="px-4 py-4 max-h-[50vh] overflow-y-auto scrollbar-thin">
            {editing ? (
              <div className="animate-fadeIn">
                <textarea value={editedText} onChange={(e) => setEditedText(e.target.value)}
                  className="w-full h-48 rounded-xl border border-line bg-elev p-3 text-sm leading-relaxed resize-y transition-all duration-200 ease-tg focus:outline-none focus:border-brand focus:bg-card focus:ring-4 focus:ring-brand/15" />
                <div className="flex gap-2 mt-2.5">
                  <button onClick={handleSave} disabled={saving}
                    className="press flex items-center gap-1.5 px-3.5 py-2 rounded-full brand-gradient text-white text-xs font-semibold shadow-brand hover:brightness-105 disabled:opacity-60">
                    <Icon name={saving ? "progress_activity" : "check"} size={14} className={saving ? "animate-spin" : ""} /> {saving ? "..." : "Зберегти"}
                  </button>
                  <button onClick={() => { setEditing(false); setEditedText(post.translatedText || ""); }}
                    className="press px-3.5 py-2 rounded-full text-xs font-medium text-ink-2 bg-card border border-line hover:border-line-2">
                    Скасувати
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-sm leading-relaxed text-ink whitespace-pre-wrap break-words">
                {translationClean || <span className="text-faint italic">Немає перекладу</span>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Media */}
      {(post.mediaFiles?.length > 0 || true) && (
        <div className={`${panelClass} mt-4 p-4`}>
          <div className="flex items-center justify-between mb-3">
            <span className={panelLabel}>
              Медіа {post.mediaFiles?.length > 0 && `(${post.mediaFiles.length})`}
            </span>
            <label className="press flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-muted hover:text-brand hover:bg-brand-soft cursor-pointer">
              <Icon name="add_photo_alternate" size={14} /> Додати
              <input type="file" className="hidden" onChange={handleUploadMedia} />
            </label>
          </div>
          {post.mediaFiles?.length > 0 && <MediaPreview files={post.mediaFiles} onDelete={handleDeleteMedia} />}
        </div>
      )}

      {(actionLoading === "publish" || post.status === "PUBLISHING") && (
        <div className="mt-4 rounded-card border border-line bg-card shadow-card overflow-hidden animate-fadeInUp">
          <div className="h-1 barber" />
          <div className="flex items-start gap-2.5 px-4 py-3 text-sm text-ink-2">
            <Icon name="progress_activity" size={18} className="animate-spin text-brand mt-0.5 shrink-0" />
            Публікую в фоні — переклад, завантаження медіа на сайт, відправка в Telegram. Сторінку можна закрити.
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-5 flex-wrap">
        {post.status === "PENDING" && (
          <>
            <button onClick={() => handleAction("approve")} disabled={actionLoading !== null}
              className="press flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full bg-success text-white text-sm font-semibold shadow-lift hover:brightness-105 disabled:opacity-60 disabled:cursor-not-allowed">
              <Icon name={actionLoading === "approve" ? "progress_activity" : "check"} size={18} className={actionLoading === "approve" ? "animate-spin" : ""} />
              {actionLoading === "approve" ? "Схвалення..." : "Схвалити"}
            </button>
            <button onClick={() => handleAction("reject")} disabled={actionLoading !== null}
              className="press flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full bg-danger text-white text-sm font-semibold shadow-lift hover:brightness-105 disabled:opacity-60 disabled:cursor-not-allowed">
              <Icon name={actionLoading === "reject" ? "progress_activity" : "close"} size={18} className={actionLoading === "reject" ? "animate-spin" : ""} />
              {actionLoading === "reject" ? "Відхилення..." : "Відхилити"}
            </button>
          </>
        )}
        {post.status === "APPROVED" && (
          <button onClick={() => handleAction("publish")} disabled={actionLoading !== null}
            className="press flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full brand-gradient text-white text-sm font-semibold shadow-brand hover:brightness-105 disabled:opacity-60 disabled:cursor-not-allowed">
            <Icon name={actionLoading === "publish" ? "progress_activity" : "send"} size={18} className={actionLoading === "publish" ? "animate-spin" : ""} />
            {actionLoading === "publish" ? "Публікація..." : "Опублікувати"}
          </button>
        )}
        {post.status !== "PENDING" && post.status !== "PUBLISHING" && (
          <button onClick={handleReset}
            className="press flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-medium text-ink-2 bg-card border border-line hover:border-line-2 hover:bg-elev">
            <Icon name="restart_alt" size={18} /> Скинути
          </button>
        )}
        {post.status !== "PUBLISHING" && (
          <button onClick={handleDelete}
            className="press flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-medium text-danger border border-danger/30 hover:bg-danger-soft sm:ml-auto">
            <Icon name="delete" size={18} /> Видалити
          </button>
        )}
      </div>
    </div>
  );
}
