import {
  createCommentAction,
  deleteCommentAction,
} from "@/app/posts/actions";
import { MarkdownView } from "@/components/posts/MarkdownView";
import type { CommentNode } from "@/lib/comments/tree";

type Comment = CommentNode<{
  id: string;
  parent_id: string | null;
  content_md: string;
  author_id: string;
  created_at: string;
  profiles?: { display_name: string; username: string } | null;
}>;

type CommentSectionProps = {
  postId: string;
  slug: string;
  comments: Comment[];
  currentUserId: string | null;
};

function CommentItem({
  comment,
  postId,
  slug,
  currentUserId,
}: {
  comment: Comment;
  postId: string;
  slug: string;
  currentUserId: string | null;
}) {
  return (
    <li className="comment-item">
      <div className="post-meta">
        <span>{comment.profiles?.display_name ?? "匿名"}</span>
        <span>{new Date(comment.created_at).toLocaleString()}</span>
      </div>
      <MarkdownView content={comment.content_md} />
      <form action={createCommentAction} className="reply-form">
        <input type="hidden" name="postId" value={postId} />
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="parentId" value={comment.id} />
        <input name="content" placeholder="回复..." />
        <button type="submit" className="button-secondary">
          回复
        </button>
      </form>
      {currentUserId === comment.author_id ? (
        <form action={deleteCommentAction}>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="commentId" value={comment.id} />
          <button type="submit" className="button-secondary">
            删除
          </button>
        </form>
      ) : null}
      {comment.replies.length ? (
        <ul className="comment-replies">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              postId={postId}
              slug={slug}
              currentUserId={currentUserId}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function CommentSection({
  postId,
  slug,
  comments,
  currentUserId,
}: CommentSectionProps) {
  return (
    <section className="comments-section">
      <h2>评论 · {comments.length}</h2>
      <form action={createCommentAction} className="comment-form">
        <input type="hidden" name="postId" value={postId} />
        <input type="hidden" name="slug" value={slug} />
        <textarea name="content" rows={4} placeholder="写下评论，支持 Markdown" />
        <button type="submit" className="button-primary">
          发布评论
        </button>
      </form>
      {comments.length ? (
        <ul className="comment-list">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              postId={postId}
              slug={slug}
              currentUserId={currentUserId}
            />
          ))}
        </ul>
      ) : (
        <p className="empty-text">还没有评论。</p>
      )}
    </section>
  );
}
