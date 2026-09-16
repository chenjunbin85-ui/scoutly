import logging
import csv
import io
from typing import List
from app.models.opportunity import Opportunity

logger = logging.getLogger(__name__)


class ExportService:
    @staticmethod
    def to_markdown(opportunities: List[Opportunity], project_name: str) -> str:
        """导出为 Markdown 格式"""
        lines = [
            f"# ThreadScout 报告：{project_name}",
            "",
            f"导出机会数：{len(opportunities)}",
            "",
            "---",
            "",
        ]

        for i, opp in enumerate(opportunities, 1):
            lines.extend([
                f"## {i}. {opp.title}",
                "",
                f"- **分数**：{opp.score}/100",
                f"- **优先级**：{opp.priority}",
                f"- **意图类型**：{opp.intent_type or 'N/A'}",
                f"- **风险等级**：{opp.risk_level}",
                f"- **状态**：{opp.status}",
                f"- **subreddit**：r/{opp.subreddit or 'N/A'}",
                f"- **评论数**：{opp.num_comments}",
                f"- **链接**：{opp.url or 'N/A'}",
                "",
            ])

            if opp.summary:
                lines.extend([f"**摘要**：{opp.summary}", ""])

            if opp.suggested_angle:
                lines.extend([f"**建议回复角度**：{opp.suggested_angle}", ""])

            if opp.what_not_to_do:
                lines.extend([f"**注意事项**：{opp.what_not_to_do}", ""])

            if opp.content_opportunity:
                lines.extend([f"**内容机会**：{opp.content_opportunity}", ""])

            # 评分明细
            if opp.score_breakdowns:
                lines.append("**评分明细**：")
                lines.append("")
                lines.append("| 维度 | 得分 | 满分 | 说明 |")
                lines.append("|---|---|---|---|")
                for bd in opp.score_breakdowns:
                    lines.append(f"| {bd.dimension} | {bd.score} | {bd.max_score} | {bd.note or ''} |")
                lines.append("")

            lines.append("---")
            lines.append("")

        return "\n".join(lines)

    @staticmethod
    def to_csv(opportunities: List[Opportunity]) -> str:
        """导出为 CSV 格式"""
        output = io.StringIO()
        writer = csv.writer(output)

        writer.writerow([
            "title", "score", "priority", "intent_type", "risk_level",
            "status", "subreddit", "num_comments", "posted_at",
            "summary", "suggested_angle", "what_not_to_do",
            "content_opportunity", "url",
        ])

        for opp in opportunities:
            writer.writerow([
                opp.title,
                opp.score,
                opp.priority,
                opp.intent_type or "",
                opp.risk_level,
                opp.status,
                opp.subreddit or "",
                opp.num_comments,
                opp.posted_at.isoformat() if opp.posted_at else "",
                opp.summary or "",
                opp.suggested_angle or "",
                opp.what_not_to_do or "",
                opp.content_opportunity or "",
                opp.url or "",
            ])

        return output.getvalue()
