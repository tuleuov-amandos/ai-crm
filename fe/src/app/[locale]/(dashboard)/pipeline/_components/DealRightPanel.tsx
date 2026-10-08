import { DealAiAnalyzer } from "./DealAiAnalyzer";
import ActivityTimeline from "@/components/activities/ActivityTimeline";
import { ActivityItem, CreateActivityForContactBodyType } from "@/lib/validations/activities.scheme";
import { useCreateDealActivity, useUploadActivityAttachment } from "@/hooks/useActivities";
import { cn } from "@/lib/utils";

interface DealRightPanelProps {
  dealId: string;
  activities: ActivityItem[];
  className?: string;
}

export function DealRightPanel({ dealId, activities, className }: DealRightPanelProps) {
  const createActivity = useCreateDealActivity(dealId);
  const uploadAttachment = useUploadActivityAttachment();

  const handleSubmitActivity = (
    data: CreateActivityForContactBodyType,
    file: File | null,
    reset: () => void,
  ) => {
    createActivity.mutate(data, {
      onSuccess: (created) => {
        reset();
        if (file) {
          uploadAttachment.mutate({ id: created.id, file });
        }
      },
    });
  };

  return (
    <div className={cn("flex-1 flex flex-col overflow-y-auto bg-[#F8F8F7] dark:bg-background max-md:min-w-0", className)}>
      {/* AI Analyzer */}
      <DealAiAnalyzer dealId={dealId} />

      {/* Activity Timeline */}
      <div className="border-t border-border mt-2 flex flex-col flex-1">
        <ActivityTimeline
          activities={activities}
          onSubmitActivity={handleSubmitActivity}
          isPendingSubmit={createActivity.isPending}
          entityType="deal"
        />
      </div>
    </div>
  );
}