import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Clock3, Globe2, Heart, MessageCircle, Pencil, Send, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import type { Post, Visibility } from "@/types";
import { useApp } from "@/context/AppContext";
import { formatTimeRange } from "@/lib/dateTime";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PostForm } from "./PostForm";

const visibility: Record<Visibility, { label: string; icon: typeof Globe2; classes: string }> = {
  public: { label: "Public", icon: Globe2, classes: "bg-primary-soft text-primary" },
  connections: { label: "Connections", icon: Users, classes: "bg-success-soft text-success" },
  custom: { label: "Custom", icon: Users, classes: "bg-accent-soft text-accent" },
};

export const PostCard = ({ post }: { post: Post }) => {
  const { currentUser, users, settings, deletePost, togglePostLike, addPostComment, updatePostComment, deletePostComment } = useApp();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteCommentId, setDeleteCommentId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingComment, setEditingComment] = useState("");
  const [comment, setComment] = useState("");
  const editHistoryRef = useRef(false);
  const author = users.find((user) => user.id === post.userId);
  const isMine = currentUser?.id === post.userId;
  const liked = (post.likes ?? []).includes(currentUser?.id ?? "");
  const meta = visibility[post.visibility ?? author?.privacy ?? "public"];
  const Icon = meta.icon;

  useEffect(() => {
    if (!editOpen || editHistoryRef.current) return;
    window.history.pushState({ ...window.history.state, taskmatesModal: "edit-activity" }, "", window.location.href);
    editHistoryRef.current = true;
  }, [editOpen]);

  useEffect(() => {
    const onPopState = () => {
      if (!editHistoryRef.current) return;
      editHistoryRef.current = false;
      setEditOpen(false);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const closeEdit = () => {
    if (editHistoryRef.current) {
      editHistoryRef.current = false;
      window.history.back();
    }
    setEditOpen(false);
  };

  const submitComment = (event: React.FormEvent) => {
    event.preventDefault();
    const result = addPostComment(post.id, comment);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setComment("");
  };

  const saveComment = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingCommentId) return;
    const result = updatePostComment(post.id, editingCommentId, editingComment);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Comment updated.");
    setEditingCommentId(null);
    setEditingComment("");
  };

  const deleteSelectedComment = () => {
    if (!deleteCommentId) return;
    const result = deletePostComment(post.id, deleteCommentId);
    if (!result.ok) toast.error(result.error);
    else toast.success("Comment deleted.");
    setDeleteCommentId(null);
  };

  return (
    <article className="tap-lift animate-fade-in-up rounded-lg border border-border bg-card p-4 shadow-soft">
      <header className="mb-4 flex items-start justify-between gap-3">
        <Link to={author ? `/profile/${author.username}` : "#"} className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-primary font-bold text-primary-foreground">
            {author?.username.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{author?.username ?? "unknown"}</p>
            <p className="truncate text-xs text-muted-foreground">{new Date(post.startTime).toLocaleDateString()}</p>
          </div>
        </Link>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${meta.classes}`}>
          <Icon className="size-3" />
          {meta.label}
        </span>
      </header>

      <div className="mb-3 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm font-semibold">
        <Clock3 className="size-4 text-primary" />
        {formatTimeRange(post.startTime, post.endTime, settings.timeFormat)}
      </div>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{post.content}</p>

      <section className="mt-4 space-y-3 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={liked ? "default" : "outline"}
            className="h-9"
            onClick={() => {
              const result = togglePostLike(post.id);
              if (!result.ok) toast.error(result.error);
            }}
          >
            <Heart className="mr-1 size-4" /> {liked ? "Liked" : "Like"}
          </Button>
          <span className="text-xs font-bold text-muted-foreground">{(post.likes ?? []).length} likes</span>
          <span className="text-xs font-bold text-muted-foreground">-</span>
          <span className="flex items-center gap-1 text-xs font-bold text-muted-foreground">
            <MessageCircle className="size-3.5" /> {(post.comments ?? []).length} comments
          </span>
        </div>

        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-black uppercase text-muted-foreground">
            <MessageCircle className="size-3.5" /> Comments
          </p>
          {(post.comments ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">No comments yet.</p>
          ) : (
            (post.comments ?? []).map((item) => {
              const commenter = users.find((user) => user.id === item.userId);
              const canDelete = currentUser?.id === item.userId || currentUser?.id === post.userId;
              const canEdit = currentUser?.id === item.userId;
              return (
                <div key={item.id} className="rounded-lg bg-muted/70 px-3 py-2 text-sm">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <Link to={commenter ? `/profile/${commenter.username}` : "#"} className="truncate text-xs font-black text-primary">
                      {commenter?.username ?? "unknown"}
                    </Link>
                    <div className="flex shrink-0 items-center gap-2">
                      {canEdit && (
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-primary"
                          onClick={() => {
                            setEditingCommentId(item.id);
                            setEditingComment(item.content);
                          }}
                          aria-label="Edit comment"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteCommentId(item.id)}
                          aria-label="Delete comment"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  {editingCommentId === item.id ? (
                    <form onSubmit={saveComment} className="space-y-2">
                      <textarea
                        value={editingComment}
                        onChange={(event) => setEditingComment(event.target.value)}
                        rows={2}
                        maxLength={1000}
                        className="min-h-16 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      />
                      <div className="flex justify-end gap-2">
                        <Button type="button" size="sm" variant="ghost" onClick={() => setEditingCommentId(null)}>Cancel</Button>
                        <Button type="submit" size="sm">Save</Button>
                      </div>
                    </form>
                  ) : (
                    <p className="whitespace-pre-wrap break-words">{item.content}</p>
                  )}
                </div>
              );
            })
          )}
          <form onSubmit={submitComment} className="flex items-end gap-2">
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={1}
              maxLength={1000}
              placeholder="Add a comment"
              className="min-h-10 flex-1 resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
            <Button type="submit" size="icon" className="size-10 shrink-0" aria-label="Post comment">
              <Send className="size-4" />
            </Button>
          </form>
        </div>
      </section>

      {isMine && (
        <footer className="mt-4 flex gap-1 border-t border-border pt-3">
          <Button size="sm" variant="ghost" onClick={() => setEditOpen(true)}><Pencil className="mr-1 size-3.5" /> Edit</Button>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmOpen(true)}><Trash2 className="mr-1 size-3.5" /> Delete</Button>
        </footer>
      )}

      <Dialog open={editOpen} onOpenChange={(nextOpen) => nextOpen ? setEditOpen(true) : closeEdit()}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-lg">
          <DialogHeader><DialogTitle>Edit activity</DialogTitle></DialogHeader>
          <PostForm initial={post} onClose={closeEdit} onSaved={closeEdit} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this activity?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete this activity log.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => {
                deletePost(post.id);
                toast.success("Activity deleted.");
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(deleteCommentId)} onOpenChange={(open) => !open && setDeleteCommentId(null)}>
        <AlertDialogContent className="rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this comment?</AlertDialogTitle>
            <AlertDialogDescription>This comment will be permanently removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={deleteSelectedComment}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
};

export default PostCard;
