//+------------------------------------------------------------------+
//| Ledgerline Bridge (MT5). Read-only: it sends CLOSED trades to    |
//| your Ledgerline journal. It never places, changes or closes      |
//| orders, and it never reads your account password.                |
//| Setup: Tools > Options > Expert Advisors > tick "Allow WebRequest"|
//| and add the Ledgerline address below to the list.                |
//+------------------------------------------------------------------+
#property strict
input string LedgerlineUrl = "https://YOUR-LEDGERLINE-API/api/metatrader/ingest"; // shown in Settings > MetaTrader
input string Token         = "";   // paste the token from Settings > MetaTrader
input int    DaysBack      = 30;   // how far back to look on start
input int    EverySeconds  = 120;  // how often to check for newly closed trades

datetime lastSent = 0;

int OnInit()
{
   if(Token == "") { Print("Ledgerline: paste your token in the inputs."); return INIT_PARAMETERS_INCORRECT; }
   lastSent = TimeCurrent() - DaysBack * 86400;
   EventSetTimer(EverySeconds);
   Send();
   return INIT_SUCCEEDED;
}
void OnDeinit(const int reason) { EventKillTimer(); }
void OnTimer() { Send(); }

string Num(double v, int digits = 8) { return DoubleToString(v, digits); }

void Send()
{
   if(!HistorySelect(lastSent - 86400, TimeCurrent() + 60)) return;
   string items = ""; int count = 0; datetime newest = lastSent;
   for(int i = 0; i < HistoryDealsTotal() && count < 150; i++)
   {
      ulong deal = HistoryDealGetTicket(i);
      if(deal == 0) continue;
      long entry = HistoryDealGetInteger(deal, DEAL_ENTRY);
      long type  = HistoryDealGetInteger(deal, DEAL_TYPE);
      if(entry != DEAL_ENTRY_OUT || (type != DEAL_TYPE_BUY && type != DEAL_TYPE_SELL)) continue;
      datetime closeTime = (datetime)HistoryDealGetInteger(deal, DEAL_TIME);
      if(closeTime <= lastSent) continue;
      ulong pos = (ulong)HistoryDealGetInteger(deal, DEAL_POSITION_ID);
      // find the opening deal of the same position
      datetime openTime = 0; double openPrice = 0, sl = 0, tp = 0;
      for(int j = 0; j < HistoryDealsTotal(); j++)
      {
         ulong d2 = HistoryDealGetTicket(j);
         if(d2 == 0 || (ulong)HistoryDealGetInteger(d2, DEAL_POSITION_ID) != pos) continue;
         if(HistoryDealGetInteger(d2, DEAL_ENTRY) != DEAL_ENTRY_IN) continue;
         openTime = (datetime)HistoryDealGetInteger(d2, DEAL_TIME);
         openPrice = HistoryDealGetDouble(d2, DEAL_PRICE);
         ulong ord = (ulong)HistoryDealGetInteger(d2, DEAL_ORDER);
         if(HistoryOrderSelect(ord)) { sl = HistoryOrderGetDouble(ord, ORDER_SL); tp = HistoryOrderGetDouble(ord, ORDER_TP); }
         break;
      }
      if(openTime == 0) continue;
      // a closing SELL deal closes a BUY position, so the trade type is the opposite of the closing deal
      string side = (type == DEAL_TYPE_SELL) ? "buy" : "sell";
      if(count > 0) items += ",";
      items += "{\"ticket\":\"" + (string)pos + "\",\"symbol\":\"" + HistoryDealGetString(deal, DEAL_SYMBOL) + "\",\"type\":\"" + side + "\","
            + "\"volume\":" + Num(HistoryDealGetDouble(deal, DEAL_VOLUME), 2) + ",\"open_time\":" + (string)(long)openTime + ",\"open_price\":" + Num(openPrice)
            + ",\"sl\":" + Num(sl) + ",\"tp\":" + Num(tp) + ",\"close_time\":" + (string)(long)closeTime + ",\"close_price\":" + Num(HistoryDealGetDouble(deal, DEAL_PRICE))
            + ",\"commission\":" + Num(HistoryDealGetDouble(deal, DEAL_COMMISSION), 2) + "}";
      count++; if(closeTime > newest) newest = closeTime;
   }
   // With no new closed trades this still posts an empty list, so Ledgerline can show the link as connected.
   string body = "{\"account\":\"" + (string)AccountInfoInteger(ACCOUNT_LOGIN) + "\",\"trades\":[" + items + "]}";
   char post[], result[]; string headers = "Content-Type: application/json\r\nAuthorization: Bearer " + Token + "\r\n", rh;
   StringToCharArray(body, post, 0, StringLen(body));
   int code = WebRequest("POST", LedgerlineUrl, headers, 8000, post, result, rh);
   if(code == 200) { lastSent = newest; if(count > 0) Print("Ledgerline: sent ", count, " closed trades."); }
   else Print("Ledgerline: not sent (", code, "). ", code == -1 ? "Allow the address in Tools > Options > Expert Advisors." : CharArrayToString(result));
}
