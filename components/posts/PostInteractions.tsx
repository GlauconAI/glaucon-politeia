import {
  toggleBookmarkAction,
  toggleLikeAction,
} from "@/app/posts/actions";

type PostInteractionsProps = {
  postId: string;
  slug: string;
  liked: boolean;
  bookmarked: boolean;
  likeCount: number;
  bookmarkCount: number;
};

export function PostInteractions({
  postId,
  slug,
  liked,
  bookmarked,
  likeCount,
  bookmarkCount,
}: PostInteractionsProps) {
  return (
    <div className="interaction-row">
      <form action={toggleLikeAction}>
        <input type="hidden" name="postId" value={postId} />
        <input type="hidden" name="slug" value={slug} />
        <button type="submit" className="button-secondary">
          {liked ? "已点赞" : "点赞"} · {likeCount}
        </button>
      </form>
      <form action={toggleBookmarkAction}>
        <input type="hidden" name="postId" value={postId} />
        <input type="hidden" name="slug" value={slug} />
        <button type="submit" className="button-secondary">
          {bookmarked ? "已收藏" : "收藏"} · {bookmarkCount}
        </button>
      </form>
    </div>
  );
}
