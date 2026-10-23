import { signal } from "@preact/signals";

/**
 * What the add form hands to the thank-you page without another request: the new spot's id, the types picked and an
 * object URL of the photo that was just sent (the spot may still be `pending` if the admin approves submissions, so
 * `GET /api/spots/:id` cannot be relied on right away).
 */
export interface CreatedSpot {
  id: string;
  types: string[];
  photoUrl: string | null;
  lat: number;
  lng: number;
}

export const lastCreated = signal<CreatedSpot | null>(null);
