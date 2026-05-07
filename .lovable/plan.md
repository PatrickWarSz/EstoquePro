# Pending UI/UX Tasks for Lovable AI

1. **LoginPage.tsx:**
   - Remove the `isFirstSetup` auto-detection.
   - Implement a manual toggle/button to switch between "Create Company" (Register) and "Log In".
   - Ensure "Company Name" and "Document (CPF/CNPJ)" inputs exist on the Register view.

2. **AppSidebar.tsx:**
   - Remove the redundant "Sistema" / "Configurações" link from the sidebar.

3. **HistoricoPage.tsx:**
   - Remove the "Delete/Trash" button entirely (History entries must be immutable for audit).

4. **FuncionariosPage.tsx:**
   - Format the WhatsApp invite message so the URL is on its own line (clickable).