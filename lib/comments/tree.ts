type CommentRow = {
  id: string;
  parent_id: string | null;
  created_at: string;
};

export type CommentNode<T extends CommentRow = CommentRow> = T & {
  replies: CommentNode<T>[];
};

export function buildCommentTree<T extends CommentRow>(comments: T[]) {
  const nodes = new Map<string, CommentNode<T>>();

  for (const comment of comments) {
    nodes.set(comment.id, { ...comment, replies: [] });
  }

  const roots: CommentNode<T>[] = [];

  for (const node of [...nodes.values()].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  )) {
    if (node.parent_id && nodes.has(node.parent_id)) {
      nodes.get(node.parent_id)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}
