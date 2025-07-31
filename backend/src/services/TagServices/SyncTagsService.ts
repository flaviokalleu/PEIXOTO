import Tag from "../../models/Tag";
import Contact from "../../models/Contact";
import ContactTag from "../../models/ContactTag";

interface Request {
  tags: Tag[];
  contactId: number;
}

const SyncTags = async ({
  tags,
  contactId
}: Request): Promise<Contact | null> => {
  // Validar se contactId é válido
  if (!contactId || contactId === undefined || contactId === null) {
    throw new Error("contactId is required and cannot be undefined");
  }

  const contact = await Contact.findByPk(contactId, { include: [Tag] });

  if (!contact) {
    throw new Error(`Contact with id ${contactId} not found`);
  }

  const tagList = tags.map(t => ({ tagId: t.id, contactId }));

  // Só executar destroy se contactId for válido
  if (contactId) {
    await ContactTag.destroy({ where: { contactId } });
  }
  
  if (tagList.length > 0) {
    await ContactTag.bulkCreate(tagList);
  }

  await contact.reload();

  return contact;
};

export default SyncTags;
