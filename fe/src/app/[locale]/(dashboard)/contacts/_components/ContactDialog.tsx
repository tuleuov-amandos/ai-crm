import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslations } from "next-intl";
import { useCreateContact, useUpdateContact } from "@/hooks/useContacts";
import { Contact, CreateContactBodyType } from "@/lib/validations/contacts.scheme";
import ContactForm from "./ContactForm";
interface ContactDialogProps {
  contact?: Contact;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (contact: Contact) => void;
}
function ContactDialog({
  contact,
  isOpen,
  onOpenChange,
  onCreated,
}: ContactDialogProps) {
  const t = useTranslations("contacts.dialog");
  const { mutateAsync: createContact, isPending: isCreating } =
    useCreateContact();
  const { mutateAsync: updateContact, isPending: isUpdating } =
    useUpdateContact();

  const isEditing = !!contact;
  const isPending = isCreating || isUpdating;

  async function handleSubmit(data: CreateContactBodyType) {
    console.log("isEditing:", isEditing);
    console.log("contact id:", contact?.id);
    console.log("data payload:", data);
    try {
      if (isEditing && contact?.id) {
        await updateContact({ id: contact.id, data });
      } else {
        const createdContact = await createContact(data);
        onCreated?.(createdContact);
      }
      onOpenChange(false);
    } catch (error) {
      console.error("Error submitting contact form:", error);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? t("editTitle") : t("createTitle")}</DialogTitle>
          <DialogDescription>
            {isEditing ? t("editDescription") : t("createDescription")}
          </DialogDescription>
        </DialogHeader>
        <ContactForm
          isOpen={isOpen}
          onOpenChange={onOpenChange}
          onSubmit={handleSubmit}
          isPending={isPending}
          defaultValues={contact}
        />
      </DialogContent>
    </Dialog>
  );
}

export default ContactDialog;
