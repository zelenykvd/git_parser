import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { fetchPost, updatePost, approvePost, rejectPost, publishPost, translatePost, deletePost, resetPost, uploadMedia, deleteMedia } from "../api";
import StatusBadge from "../components/StatusBadge";
import MediaPreview from "../components/MediaPreview";
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
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"original" | "translation">("original");

  useEffect(() => {
    fetchPost(Number(id)).then((p) => { setPost(p); setEditedText(p.translatedText || ""); }).catch(console.error);
  }, [id]);

  if (!post) return (
    <div className="flex items-center justify-center py-20">
      <Icon name="progress_activity" size={24} className="animate-spin text-neutral-300" />
    </div>
  );

  async function handleSave() {
    setSaving(true); setError("");
    try { await updatePost(post.id, editedText); setPost({ ...post, translatedText: editedText }); setEditing(false); }
    catch (err: any) { setError(err.message); } finally { setSaving(false); }
  }

  async function handleAction(action: "approve" | "reject" | "publish") {
    setError("");
    try {
      if (action === "approve") await approvePost(post.id);
      else if (action === "reject") await rejectPost(post.id);
      else await publishPost(post.id);
      setPost(await fetchPost(post.id));
    } catch (err: any) { setError(err.message); }
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

  return (
    <div className="animate-fadeIn">
      {/* Back */}
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-neutral-400 hover:text-neutral-600 transition-colors mb-3">
        <Icon name="arrow_back" size={16} /> Назад
      </button>

      {/* Header */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <h1 className="text-base sm:text-lg font-semibold">Пост #{post.id}</h1>
        <StatusBadge status={post.status} />
        <span className="text-xs text-neutral-400">{post.channel?.username ? `@${post.channel.username}` : post.channel?.title || ""}</span>
        {post.vaibeCodUrl && (
          <span className="flex items-center gap-1 text-xs">
            <a href={`https://www.vaibecod.com${post.vaibeCodUrl}`} target="_blank" rel="noopener noreferrer"
              className="text-blue-600 hover:underline">UK ↗</a>
            {post.vaibeCodUrlEn && (
              <>
                <span className="text-neutral-300">|</span>
                <a href={`https://www.vaibecod.com${post.vaibeCodUrlEn}`} target="_blank" rel="noopener noreferrer"
                  className="text-blue-600 hover:underline">EN ↗</a>
              </>
            )}
          </span>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm px-3 py-2 border border-red-200 mb-4">
          <Icon name="error" size={16} /> {error}
        </div>
      )}

      {/* Mobile: tabs / Desktop: side-by-side */}
      <div className="md:hidden flex border-b border-neutral-200 mb-0">
        <button onClick={() => setTab("original")}
          className={`flex-1 py-2.5 text-xs font-medium text-center transition-colors ${tab === "original" ? "text-neutral-900 border-b-2 border-neutral-900" : "text-neutral-400"}`}>
          Оригінал
        </button>
        <button onClick={() => setTab("translation")}
          className={`flex-1 py-2.5 text-xs font-medium text-center transition-colors ${tab === "translation" ? "text-neutral-900 border-b-2 border-neutral-900" : "text-neutral-400"}`}>
          Переклад
        </button>
      </div>

      <div className="md:grid md:grid-cols-2 md:gap-4">
        {/* Original */}
        <div className={`bg-white border border-neutral-200 ${tab === "original" ? "block" : "hidden"} md:block`}>
          <div className="px-4 py-2.5 border-b border-neutral-100">
            <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider">Оригінал</span>
          </div>
          <div className="px-4 py-4 text-sm leading-relaxed whitespace-pre-wrap break-words max-h-[50vh] overflow-y-auto scrollbar-thin">
            {originalClean}
          </div>
        </div>

        {/* Translation */}
        <div className={`bg-white border border-neutral-200 ${tab === "translation" ? "block" : "hidden"} md:block`}>
          <div className="px-4 py-2.5 border-b border-neutral-100 flex items-center justify-between">
            <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider">Переклад</span>
            <div className="flex gap-1">
              {!editing && !post.translatedText && (
                <button onClick={() => handleTranslate(false)} disabled={translating}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  <Icon name="translate" size={13} />
                  {translating ? "..." : "Перекласти"}
                </button>
              )}
              {!editing && post.translatedText && (
                <button onClick={() => handleTranslate(true)} disabled={translating}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-neutral-500 border border-neutral-200 hover:border-neutral-300 disabled:opacity-50 transition-colors">
                  <Icon name="refresh" size={13} />
                  {translating ? "..." : "Заново"}
                </button>
              )}
              {!editing && (
                <button onClick={() => setEditing(true)}
                  className="flex items-center px-2 py-1 text-xs text-neutral-400 hover:text-neutral-600 transition-colors">
                  <Icon name="edit" size={13} />
                </button>
              )}
            </div>
          </div>
          <div className="px-4 py-4 max-h-[50vh] overflow-y-auto scrollbar-thin">
            {editing ? (
              <div>
                <textarea value={editedText} onChange={(e) => setEditedText(e.target.value)}
                  className="w-full h-48 border border-neutral-200 p-3 text-sm resize-y focus:outline-none focus:border-neutral-900 transition-colors" />
                <div className="flex gap-2 mt-2">
                  <button onClick={handleSave} disabled={saving}
                    className="flex items-center gap-1 px-3 py-1.5 bg-neutral-900 text-white text-xs font-medium hover:bg-neutral-800 disabled:opacity-50 transition-colors">
                    <Icon name="check" size={14} /> {saving ? "..." : "Зберегти"}
                  </button>
                  <button onClick={() => { setEditing(false); setEditedText(post.translatedText || ""); }}
                    className="px-3 py-1.5 text-xs border border-neutral-200 hover:border-neutral-300 transition-colors">
                    Скасувати
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                {translationClean || <span className="text-neutral-300 italic">Немає перекладу</span>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Media */}
      {(post.mediaFiles?.length > 0 || true) && (
        <div className="mt-4 bg-white border border-neutral-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider">
              Медіа {post.mediaFiles?.length > 0 && `(${post.mediaFiles.length})`}
            </span>
            <label className="flex items-center gap-1 px-2 py-1 text-xs text-neutral-400 hover:text-neutral-600 cursor-pointer transition-colors">
              <Icon name="add_photo_alternate" size={14} /> Додати
              <input type="file" className="hidden" onChange={handleUploadMedia} />
            </label>
          </div>
          {post.mediaFiles?.length > 0 && <MediaPreview files={post.mediaFiles} onDelete={handleDeleteMedia} />}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-4 flex-wrap">
        {post.status === "PENDING" && (
          <>
            <button onClick={() => handleAction("approve")}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors">
              <Icon name="check" size={18} /> Схвалити
            </button>
            <button onClick={() => handleAction("reject")}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors">
              <Icon name="close" size={18} /> Відхилити
            </button>
          </>
        )}
        {post.status === "APPROVED" && (
          <button onClick={() => handleAction("publish")}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
            <Icon name="send" size={18} /> Опублікувати
          </button>
        )}
        {post.status !== "PENDING" && (
          <button onClick={handleReset}
            className="flex items-center justify-center gap-1 px-4 py-2.5 text-sm border border-neutral-200 text-neutral-600 hover:border-neutral-300 transition-colors">
            <Icon name="restart_alt" size={18} /> Скинути
          </button>
        )}
        <button onClick={handleDelete}
          className="flex items-center justify-center gap-1 px-4 py-2.5 text-sm text-red-500 border border-red-200 hover:bg-red-50 transition-colors sm:ml-auto">
          <Icon name="delete" size={18} /> Видалити
        </button>
      </div>
    </div>
  );
}
