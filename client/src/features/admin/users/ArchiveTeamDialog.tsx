import { ConfirmPhraseDialog } from '../ConfirmPhraseDialog';

interface Props {
  teamName: string;
  memberCount: number;
  onCancel: () => void;
  /** Archives the team: true when it went through (the dialog is then closed), false to stay open. */
  onConfirm: () => Promise<boolean>;
}

/**
 * Archive “team” ? (Figma 11029:243301), asked before a team goes inactive, from the Teams tab's row
 * menu or a team's edit view. Archive unlocks once the team's name is typed.
 */
export function ArchiveTeamDialog({ teamName, memberCount, onCancel, onConfirm }: Props) {
  return (
    <ConfirmPhraseDialog
      icon="/admin/user/archive-trash.svg"
      title={<>Archive “{teamName}” ?</>}
      note="Once you archive it, its members will no longer be dedicated to this team. Their permissions and access won’t change in any case."
      item={{ name: teamName, meta: `${memberCount} ${memberCount === 1 ? 'Member' : 'Members'}` }}
      phrase={teamName}
      placeholder="Team name"
      confirmLabel="Archive"
      busyLabel="Archiving…"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
