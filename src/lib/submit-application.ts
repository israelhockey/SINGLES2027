import { supabase } from "@/integrations/supabase/client";
import type { Application, ApplicationFiles } from "./application";

async function uploadLogo(id: string, slot: string, file: File | null): Promise<string | null> {
  if (!file) return null;
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${id}/${slot}.${ext || "png"}`;
  const { error } = await supabase.storage
    .from("logos")
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) throw error;
  return path;
}

/**
 * Saves one application: uploads logos, inserts the row.
 * Returns { saved: false } on any failure so the WhatsApp fallback shows.
 */
export async function submitApplication(
  data: Application,
  files: ApplicationFiles,
): Promise<{ saved: boolean }> {
  try {
    const id = crypto.randomUUID();
    const logo1_path = await uploadLogo(id, "logo1", files.logo1);
    const logo2_path = await uploadLogo(id, "logo2", files.logo2);
    const { error } = await supabase.from("applications").insert({
      id,
      first_name: data.firstName,
      last_name: data.lastName,
      phone: data.phone,
      email: data.email,
      city: data.city,
      community_name: data.communityName,
      business_name: data.businessName,
      company_id: data.companyId,
      founded: data.founded,
      age_range: data.ageRange,
      purpose: data.purpose,
      audience: data.audience,
      event_types: data.eventTypes,
      events_count: data.eventsCount,
      attendance: data.attendance,
      fb_group: data.fbGroup,
      fb_page: data.fbPage,
      instagram: data.instagram,
      whatsapp: data.whatsapp,
      newsletter: data.newsletter,
      open_rate: data.openRate,
      click_rate: data.clickRate,
      total_exposure: data.totalExposure,
      partners: data.partners,
      logo1_path,
      logo2_path,
    });
    if (error) throw error;
    return { saved: true };
  } catch (e) {
    console.error("submitApplication failed", e);
    return { saved: false };
  }
}
