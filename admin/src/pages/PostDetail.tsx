import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { fetchPost, updatePost, approvePost, rejectPost, publishPost, translatePost, deletePost, resetPost, uploadMedia, deleteMedia } from "../api";
import StatusBadge from "../components/StatusBadge";
import MediaPreview from "../components/MediaPreview";
import Icon from "../components/Icon";

export default function PostDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [post, setPost] = useState<any>(null);
  const [editedText, setEditedText] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchPost(Number(id)).then((p) => { setPost(p); setEditedText(p.translatedText || ""); }).catch(console.error);
  }, [id]);

  if (!post) return (
    <div className="flex items-center gap-2 text-neutral-400 text-sm py-12 justify-center">
      <Icon name="progress_activity" size={18} className="animate-spin" />
    </div>
  );

  async function handleSave() {
    setSaving(true); setError("");
    try { await updatePost(post.id, editedText); setPost({ ...post, translatedText: editedText }); setEditing(false); }
    catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
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
    catch (err: any) { setError(err.message); }
    finally { setTranslating(false); }
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

  return (
    <div className="animate-fadeIn">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-neutral-400 hover:text-neutral-600 transition-colors mb-4">
        <Icon name="arrow_back" size={16} />
        Назад
      </button>

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <h1 className="text-lg font-semibold">Пост #{post.id}</h1>
        <StatusBadge status={post.status} />
        <span className="text-xs text-neutral-400">{post.channel?.username ? `@${post.channel.username}` : post.channel?.title || ""}</span>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm px-4 py-2 border border-red-200 mb-4">
          <Icon name="error" size={16} /> {error}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-px bg-neutral-200 border border-neutral-200">
        <div className="bg-white p-5">
          <h2 className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-3">Оригінал</h2>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{post.originalText}</div>
        </div>

        <div className="bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-medium text-neutral-400 uppercase tracking-wide">Переклад</h2>
            <div className="flex gap-2">
              {!editing && !post.translatedText && (
                <button onClick={() => handleTranslate(false)} disabled={translating}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                  <Icon name="translate" size={14} />
                  {translating ? "..." : "Перекласти"}
                </button>
              )}
              {!editing && post.translatedText && (
                <button onClick={() => handleTranslate(true)} disabled={translating}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-neutral-500 border border-neutral-200 hover:border-neutral-300 disabled:opacity-50 transition-colors">
                  <Icon name="refresh" size={14} />
                  {translating ? "..." : "Заново"}
                </button>
              )}
              {!editing && (
                <button onClick={() => setEditing(true)} className="flex items-center gap-1 px-2 py-1 text-xs text-neutral-500 hover:text-neutral-700 transition-colors">
                  <Icon name="edit" size={14} />
                </button>
              )}
            </div>
          </div>
          {editing ? (
            <div>
              <textarea value={editedText} onChange={(e) => setEditedText(e.target.value)}
                className="w-full h-48 border border-neutral-200 p-3 text-sm resize-y focus:outline-none focus:border-neutral-900 transition-colors" />
              <div className="flex gap-2 mt-2">
                <button onClick={handleSave} disabled={saving}
                  className="px-3 py-1.5 bg-neutral-900 text-white text-xs font-medium hover:bg-neutral-800 disabled:opacity-50 transition-colors">
                  {saving ? "..." : "Зберегти"}
                </button>
                <button onClick={() => { setEditing(false); setEditedText(post.translatedText || ""); }}
                  className="px-3 py-1.5 text-xs border border-neutral-200 hover:border-neutral-300 transition-colors">
                  Скасувати
                </button>
              </div>
            </div>
          ) : (
            <div className="whitespace-pre-wrap text-sm leading-relaxed">
              {post.translatedText || <span className="text-neutral-300 italic">Немає перекладу</span>}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-2">Медіа</h2>
        {post.mediaFiles?.length > 0 && <MediaPreview files={post.mediaFiles} onDelete={handleDeleteMedia} />}
        <label className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-dashed border-neutral-300 cursor-pointer hover:border-neutral-400 transition-colors">
          <Icon name="add" size={14} /> Додати файл
          <input type="file" className="hidden" onChange={handleUploadMedia} />
        </label>
      </div>

      <div className="flex gap-2 mt-6 flex-wrap border-t border-neutral-200 pt-4">
        {post.status === "PENDING" && (
          <>
            <button onClick={() => handleAction("approve")} className="flex items-center gap-1 px-4 py-2 bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors">
              <Icon name="check" size={16} /> Схвалити
            </button>
            <button onClick={() => handleAction("reject")} className="flex items-center gap-1 px-4 py-2 bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors">
              <Icon name="close" size={16} /> Відхилити
            </button>
          </>
        )}
        {post.status === "APPROVED" && (
          <button onClick={() => handleAction("publish")} className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
            <Icon name="send" size={16} /> Опублікувати
          </button>
        )}
        {post.status !== "PENDING" && (
          <button onClick={handleReset} className="flex items-center gap-1 px-4 py-2 text-sm border border-neutral-200 text-neutral-600 hover:border-neutral-300 transition-colors">
            <Icon name="restart_alt" size={16} /> Скинути
          </button>
        )}
        <button onClick={handleDelete} className="flex items-center gap-1 px-4 py-2 text-sm text-red-600 border border-red-200 hover:bg-red-50 transition-colors ml-auto">
          <Icon name="delete" size={16} /> Видалити
        </button>
      </div>
    </div>
  );
}
