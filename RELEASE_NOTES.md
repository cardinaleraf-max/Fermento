# Note di rilascio

## v1.3.1 — Luglio 2026

### Correzioni
- Risolto un errore che, dopo l'aggiornamento alla 1.3.0, impediva l'avvio dell'applicazione su Windows. L'app ora si apre regolarmente.

### Per gli utenti esistenti
Nessuna azione richiesta. I tuoi dati, configurazioni e accessi restano invariati. Apri Fermento normalmente con la tua password.

## v1.3.0 — Luglio 2026

### Novita
- Fusti a rendere: traccia i fusti consegnati a ogni cliente e i relativi rientri. Nuova vista "Fusti in giro" con i saldi per cliente e registrazione dei rientri direttamente dalla scheda.
- Campo "a rendere" nelle righe fusto di una vendita: indichi quanti fusti il cliente dovra restituire, con controllo automatico dei saldi su registrazione, modifica ed eliminazione della vendita.
- Data di scadenza modificabile in fase di confezionamento (precompilata in base alla shelf life, ma personalizzabile).
- Assistente Bira piu semplice: ora basta inserire la sola API key Groq nelle Impostazioni. Rimossi i campi tecnici superflui (provider, URL, modello): configurazione a prova di errore.
- Notifiche avvisi: badge animato sulla voce Avvisi che segnala in tempo reale quando arrivano nuovi avvisi.

### Miglioramenti
- Layout delle schermate Clienti e Magazzino ora adattivo: niente piu scroll orizzontale su schermi piccoli, le tabelle larghe scorrono in autonomia.
- Protezione del codice dell'applicazione (blindatura) per la distribuzione.

### Per gli utenti esistenti
Nessuna azione richiesta. I tuoi dati, configurazioni e accessi restano invariati. Apri Fermento normalmente con la tua password.

## v1.2.0 — Maggio 2026

### Novita
- Sistema licenze: ora Fermento richiede una chiave di licenza al primo avvio per i nuovi birrifici. I birrifici gia configurati prima di questo aggiornamento sono riconosciuti automaticamente e non devono fare nulla.
- Onboarding guidato per nuovi birrifici: configurazione iniziale in tre passaggi (identita, modalita di produzione, riepilogo).
- Identita birrificio editabile da Impostazioni: nome birrificio e nome titolare ora modificabili in qualsiasi momento.
- Schermata di attivazione licenza per primo accesso e per cambio chiave.

### Miglioramenti tecnici
- Pulizia residui di configurazione legacy non utilizzati.
- Migrazione retrocompatibilita automatica per database esistenti.
- AppID applicazione unificato (com.fermento.app).

### Per gli utenti esistenti
Nessuna azione richiesta. L'aggiornamento e trasparente: i tuoi dati, configurazioni e accessi restano invariati. Apri Fermento normalmente con la tua password.
