import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  "https://lciwbbxiylrojnphowcp.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjaXdiYnhpeWxyb2pucGhvd2NwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMjE4NDgsImV4cCI6MjA5NDY5Nzg0OH0.ttN3nsDiQiyP0FHpI5oEOPbDNwZTH8GWOGiW1_Pr_dI"
);
