# Supabase Storage Setup

## WICHTIG: Service Role Key hinzufügen

Füge den **Service Role Key** zu deiner `.env` Datei hinzu:

```env
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Wo findest du den Service Role Key?**
1. Gehe zu https://app.supabase.com
2. Wähle dein Projekt
3. Gehe zu **Settings** → **API**
4. Kopiere den **`service_role` key** (NICHT der `anon` key!)
5. Füge ihn zu deiner `.env` Datei hinzu

⚠️ **WICHTIG:** Der Service Role Key umgeht alle Security-Policies. Bewahre ihn sicher auf und teile ihn niemals!

## Bucket erstellen

1. Gehe zu deinem Supabase Dashboard: https://app.supabase.com
2. Wähle dein Projekt aus
3. Gehe zu **Storage** im linken Menü
4. Klicke auf **"New bucket"**
5. Gib folgende Einstellungen ein:
   - **Name:** `vehicle-photos`
   - **Public bucket:** ✅ **AN** (muss aktiviert sein, damit Fotos öffentlich zugänglich sind)
   - **File size limit:** 10 MB (oder mehr)
   - **Allowed MIME types:** `image/jpeg, image/png, image/webp, image/gif`
6. Klicke auf **"Create bucket"**

## Storage Policies (Optional)

Falls du die Storage-Policies anpassen möchtest:

1. Gehe zu **Storage** → **Policies**
2. Für den Bucket `vehicle-photos` kannst du Policies erstellen, aber der Service Role Key umgeht diese automatisch

## Testen

Nach dem Hinzufügen des Service Role Keys und Erstellen des Buckets sollte der Upload-Endpoint funktionieren:
```
POST /vehicles/:id/upload-photo
```

## Alternative: Automatisches Erstellen (Code)

Der Code versucht automatisch, den Bucket zu erstellen, falls er nicht existiert. 
Falls das nicht funktioniert, erstelle ihn manuell wie oben beschrieben.

