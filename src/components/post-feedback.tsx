"use client";

import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useI18n } from "@/components/i18n/intl-provider";
import { Button } from "@/components/ui/button";

export function PostFeedback({ postId, postTitle }: { postId: string; postTitle: string }) {
  const { t } = useI18n();
  const [sent, setSent] = useState(false);
  const [rating, setRating] = useState<"helpful" | "needs-improvement">("helpful");

  async function submit() {
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId, rating, comment: `${postTitle}` }),
    });
    if (res.ok) setSent(true);
  }

  if (sent) {
    return <p className="text-sm text-muted-foreground">{t("common.feedbackThanks")}</p>;
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">{t("common.feedbackPrompt")}</span>
      <Button
        size="sm"
        variant={rating === "helpful" ? "default" : "outline"}
        onClick={() => {
          setRating("helpful");
          submit();
        }}
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="sm"
        variant={rating === "needs-improvement" ? "default" : "outline"}
        onClick={() => {
          setRating("needs-improvement");
          submit();
        }}
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
