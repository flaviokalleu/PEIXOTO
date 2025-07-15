import Contact from "../../models/Contact";
import Whatsapp from "../../models/Whatsapp";

interface HubContact {
  name: string;
  firstName: string;
  lastName: string;
  picture: string;
  from: string;
  whatsapp?: Whatsapp;
  channel: string;
}

const FindOrCreateContactService = async (
  contact: HubContact
): Promise<Contact> => {
  const { name, picture, firstName, lastName, from, channel } = contact;

  console.log('contact', contact)
  let numberFb
  let numberIg
  let contactExists

  if(channel === 'facebook'){
    numberFb = from
    contactExists = await Contact.findOne({
      where: {
        messengerId: from,
      }
    });
  }

  if(channel === 'instagram'){
    numberIg = from
    contactExists = await Contact.findOne({
      where: {
        instagramId: from
      }
    });
  }

  if (contactExists) {
    await contactExists.update({ name: name || firstName || 'Name Unavailable' , firstName, lastName, profilePicUrl: picture })
    return contactExists;
  }

  const newContact = await Contact.create({
    name: name || firstName || 'Name Unavailable',
    number: null,
    profilePicUrl: picture,
    messengerId: numberFb || null,
    instagramId: numberIg || null
  });

  return newContact;
};

export default FindOrCreateContactService;