import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Clock3, Globe2, Heart, MessageCircle, Pencil, Send, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import type { Post, PostComment, Visibility } from "@/types";
import { useApp } from "@/context/AppContext";
import { formatClockTime, formatDayAwareDateTime, formatTimeRange } from "@/lib/dateTime";
import { LinkifiedText } from "@/components/LinkifiedText";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PostForm } from "./PostForm";

const visibility: Record<Visibility, { label: string; icon: typeof Globe2; classes: string }> = {
  public: { label: "Public", icon: Globe2, classes: "bg-primary-soft text-primary" },
  connections: { label: "Connections", icon: Users, classes: "bg-success-soft text-success" },
  custom: { label: "Custom", icon: Users, classes: "bg-accent-soft text-accent" },
};

export const PostCard = ({ post, timestampMode = "dayAware" }: { post: Post; timestampMode?: "dayAware" | "timeOnly" }) => {
  const { currentUser, users, settings, deletePost, togglePostLike, addPostComment, updatePostComment, deletePostComment } = useApp();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [likesOpen, setLikesOpen] = useState(false);
  const [deleteCommentId, setDeleteCommentId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingComment, setEditingComment] = useState("");
  const [comment, setComment] = useState("");
  const [replyToCommentId, setReplyToCommentId] = useState<string | null>(null);
  const editHistoryRef = useRef(false);
  const commentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const author = users.find((user) => user.id === post.userId);
  const isMine = currentUser?.id === post.userId;
  const liked = (post.likes ?? []).includes(currentUser?.id ?? "");
  const meta = visibility[post.visibility ?? author?.privacy ?? "public"];
  const Icon = meta.icon;
  const comments = post.comments ?? [];
  const replyToComment = replyToCommentId ? comments.find((item) => item.id === replyToCommentId) : undefined;
  const replyToUser = replyToComment ? users.find((user) => user.id === replyToComment.userId) : undefined;
  const commentIds = new Set(comments.map((item) => item.id));
  const commentsByParent = comments.reduce<Record<string, PostComment[]>>((acc, item) => {
    const key = item.parentCommentId && commentIds.has(item.parentCommentId) ? item.parentCommentId : "__root__";
    acc[key] = [...(acc[key] ?? []), item];
    return acc;
  }, {});
  Object.values(commentsByParent).forEach((items) => items.sort((left, right) => left.createdAt - right.createdAt));

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
    const result = addPostComment(post.id, comment, replyToCommentId ?? undefined);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setComment("");
    setReplyToCommentId(null);
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

  const renderComment = (item: PostComment, depth = 0) => {
    const commenter = users.find((user) => user.id === item.userId);
    const parentComment = item.parentCommentId ? comments.find((parent) => parent.id === item.parentCommentId) : undefined;
    const parentCommenter = parentComment ? users.find((user) => user.id === parentComment.userId) : undefined;
    const canDelete = currentUser?.id === item.userId || currentUser?.id === post.userId;
    const canEdit = currentUser?.id === item.userId;
    const childComments = commentsByParent[item.id] ?? [];
    return (
      <div key={item.id} className={depth > 0 ? "ml-4 border-l border-border/70 pl-3" : ""}>
        <div id={`comment-${item.id}`} className="rounded-lg border border-primary/10 bg-gradient-soft px-3 py-2 text-sm dark:border-primary/15">
          <div className="mb-1 flex items-center justify-between gap-2">
            <Link to={commenter ? `/profile/${commenter.username}` : "#"} className="truncate text-xs font-black text-primary">
              {commenter?.username ?? "unknown"}
            </Link>
            <div className="flex shrink-0 items-center gap-2">
              {canEdit && (
                <button
                  type="button"
                  className="text-muted-foreground"
                  onClick={() => {
                    setEditingCommentId(item.id);
                    setEditingComment(item.content);
                  }}
                  aria-label="Edit comment"
                >
                  <Pencil className="size-3.5" />
                </button>
              )}
              <button
                type="button"
                className="text-xs font-bold text-primary"
                onClick={() => {
                  setReplyToCommentId(item.id);
                  window.requestAnimationFrame(() => commentInputRef.current?.focus());
                }}
              >
                Reply
              </button>
              {canDelete && (
                <button
                  type="button"
                  className="text-muted-foreground"
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
            <>
              {parentComment && (
                <button
                  type="button"
                  className="mb-1 block w-full rounded border-l-2 border-primary bg-background/70 px-2 py-1 text-left text-xs text-muted-foreground"
                  onClick={() => setReplyToCommentId(parentComment.id)}
                >
                  <span className="block truncate font-black text-primary">{parentCommenter?.username ?? "unknown"}</span>
                  <span className="block truncate">{parentComment.content}</span>
                </button>
              )}
              <LinkifiedText text={item.content} className="block" />
            </>
          )}
        </div>
        {childComments.length > 0 && (
          <div className="mt-2 space-y-2">
            {childComments.map((child) => renderComment(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <article id={`post-${post.id}`} className="tap-lift animate-fade-in-up overflow-hidden rounded-lg border border-border bg-card shadow-soft">
      <div className="h-1 bg-gradient-primary" />
      <div className="p-4">
      <header className="mb-4 flex items-start justify-between gap-3">
        <Link to={author ? `/profile/${author.username}` : "#"} className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-primary font-bold text-primary-foreground">
            {author?.username.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{author?.username ?? "unknown"}</p>
            <p className="truncate text-xs text-muted-foreground">
              {timestampMode === "timeOnly" ? formatClockTime(post.createdAt, settings.timeFormat) : formatDayAwareDateTime(post.createdAt, settings.timeFormat)}
            </p>
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
      <LinkifiedText text={post.content} className="block text-sm leading-relaxed text-foreground" />
 
      <section className="mt-4 space-y-3 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={liked ? "default" : "outline"}
            className={liked ? "h-9 bg-gradient-primary shadow-glow" : "h-9 border-primary/40 text-primary"}
            onClick={() => {
              const result = togglePostLike(post.id);
              if (!result.ok) toast.error(result.error);
            }}
          >
            <Heart className={liked ? "mr-1 size-4 fill-current text-rose-500" : "mr-1 size-4"} /> {liked ? "Liked" : "Like"}
          </Button>
          <button type="button" className="text-xs font-bold text-primary underline-offset-2" onClick={() => setLikesOpen(true)}>
            {(post.likes ?? []).length} likes
          </button>
          <span className="text-xs font-bold text-muted-foreground">-</span>
          <span className="flex items-center gap-1 text-xs font-bold text-muted-foreground">
            <MessageCircle className="size-3.5" /> {(post.comments ?? []).length} comments
          </span>
        </div>
 
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-black uppercase text-muted-foreground">
            <MessageCircle className="size-3.5" /> Comments
          </p>
          {comments.length === 0 ? (
            <p className="text-xs text-muted-foreground">No comments yet.</p>
          ) : (
            commentsByParent.__root__?.map((item) => renderComment(item))
          )}
          <form onSubmit={submitComment} className="relative flex items-end gap-2 pt-12">
            {replyToComment && (
              <div className="absolute left-0 right-0 -top-12 rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-soft">
                Replying to @{replyToUser?.username ?? "comment"}
                <button type="button" className="ml-2 font-bold text-primary" onClick={() => setReplyToCommentId(null)}>Cancel</button>
              </div>
            )}
            <textarea
              ref={commentInputRef}
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
          <Button size="sm" variant="ghost" onClick={() => setEditOpen(true)} className="text-primary"><Pencil className="mr-1 size-3.5" /> Edit</Button>
          <Button size="sm" variant="ghost" className="text-red-500" onClick={() => setConfirmOpen(true)}><Trash2 className="mr-1 size-3.5" /> Delete</Button>
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

      <Dialog open={likesOpen} onOpenChange={setLikesOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-lg">
          <DialogHeader><DialogTitle>Liked by</DialogTitle></DialogHeader>
          {(post.likes ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No likes yet.</p>
          ) : (
            <div className="space-y-2">
              {(post.likes ?? []).map((userId) => {
                const user = users.find((item) => item.id === userId);
                return (
                  <Link key={userId} to={user ? `/profile/${user.username}` : "#"} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft font-black text-accent">
                      {(user?.username ?? "?").charAt(0).toUpperCase()}
                    </div>
                    <span className="font-bold">{user?.username ?? "Unknown"}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

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
      </div>
    </article>
  );
};

export default PostCard;
