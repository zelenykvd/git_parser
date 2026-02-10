import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  fetchPost,
  updatePost,
  approvePost,
  rejectPost,
  publishPost,
  translatePost,
  deletePost,
  resetPost,
  uploadMedia,
  deleteMedia,
} from "../api";
import StatusBadge from "../components/StatusBadge";
import MediaPreview from "../components/MediaPreview";

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
    fetchPost(Number(id))
      .then((p) => {
        setPost(p);
        setEditedText(p.translatedText || "");
      })
      .catch(console.error);
  }, [id]);

  if (!post) return <p className="text-gray-500">Завантаження...</p>;

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await updatePost(post.id, editedText);
      setPost({ ...post, translatedText: editedText });
      setEditing(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAction(action: "approve" | "reject" | "publish") {
    setError("");
    try {
      if (action === "approve") await approvePost(post.id);
      else if (action === "reject") await rejectPost(post.id);
      else if (action === "publish") await publishPost(post.id);
      const updated = await fetchPost(post.id);
      setPost(updated);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleDelete() {
    if (!confirm("Видалити пост? Це також видалить всі медіа.")) return;
    setError("");
    try {
      await deletePost(post.id);
      navigate(-1);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleReset() {
    setError("");
    try {
      await resetPost(post.id);
      const updated = await fetchPost(post.id);
      setPost(updated);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleUploadMedia(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    try {
      await uploadMedia(post.id, file);
      const updated = await fetchPost(post.id);
      setPost(updated);
    } catch (err: any) {
      setError(err.message);
    }
    e.target.value = "";
  }

  async function handleDeleteMedia(mediaId: number) {
    if (!confirm("Видалити цей файл?")) return;
    setError("");
    try {
      await deleteMedia(mediaId);
      setPost({ ...post, mediaFiles: post.mediaFiles.filter((m: any) => m.id !== mediaId) });
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleTranslate(force = false) {
    setTranslating(true);
    setError("");
    try {
      const updated = await translatePost(post.id, force);
      setPost(updated);
      setEditedText(updated.translatedText || "");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTranslating(false);
    }
  }

  return (
    <div>
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-blue-600 hover:underline mb-4 inline-block"
      >
        &larr; Назад
      </button>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h1 className="text-2xl font-bold">Пост #{post.id}</h1>
        <StatusBadge status={post.status} />
        <span className="text-sm text-gray-500">@{post.channel?.username}</span>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-2 rounded mb-4">
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Original */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-sm font-semibold text-gray-500 mb-2">
            Оригінал
          </h2>
          <div className="whitespace-pre-wrap text-sm">{post.originalText}</div>
        </div>

        {/* Translation */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-500">Переклад</h2>
            <div className="flex gap-2">
              {!editing && !post.translatedText && (
                <button
                  onClick={() => handleTranslate(false)}
                  disabled={translating}
                  className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  {translating ? "Перекладаю..." : "Перекласти"}
                </button>
              )}
              {!editing && post.translatedText && (
                <button
                  onClick={() => handleTranslate(true)}
                  disabled={translating}
                  className="px-3 py-1 text-xs bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50"
                >
                  {translating ? "Перекладаю..." : "Переклад заново"}
                </button>
              )}
              {!editing && (
                <button
                  onClick={() => setEditing(true)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Редагувати
                </button>
              )}
            </div>
          </div>
          {editing ? (
            <div>
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                className="w-full h-48 border rounded p-2 text-sm resize-y"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "Збереження..." : "Зберегти"}
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    setEditedText(post.translatedText || "");
                  }}
                  className="px-3 py-1 border text-sm rounded"
                >
                  Скасувати
                </button>
              </div>
            </div>
          ) : (
            <div className="whitespace-pre-wrap text-sm">
              {post.translatedText || (
                <span className="text-gray-400 italic">
                  Переклад ще не готовий
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Media */}
      <div className="mt-6">
        <h2 className="text-sm font-semibold text-gray-500 mb-2">Медіа</h2>
        {post.mediaFiles?.length > 0 && (
          <MediaPreview files={post.mediaFiles} onDelete={handleDeleteMedia} />
        )}
        <label className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-dashed border-gray-300 rounded cursor-pointer hover:bg-gray-50">
          + Додати файл
          <input type="file" className="hidden" onChange={handleUploadMedia} />
        </label>
      </div>

      {/* Actions */}
      <div className="flex gap-3 mt-6 flex-wrap">
        {post.status === "PENDING" && (
          <>
            <button
              onClick={() => handleAction("approve")}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Схвалити
            </button>
            <button
              onClick={() => handleAction("reject")}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Відхилити
            </button>
          </>
        )}
        {post.status === "APPROVED" && (
          <button
            onClick={() => handleAction("publish")}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Опублікувати
          </button>
        )}
        {post.status !== "PENDING" && (
          <button
            onClick={handleReset}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Скинути
          </button>
        )}
        <button
          onClick={handleDelete}
          className="px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 ml-auto"
        >
          Видалити
        </button>
      </div>
    </div>
  );
}
