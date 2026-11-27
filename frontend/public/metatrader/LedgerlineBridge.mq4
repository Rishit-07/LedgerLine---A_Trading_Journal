//+------------------------------------------------------------------+
//| Ledgerline Bridge (MT4). Read-only: it sends CLOSED trades to    |
//| your Ledgerline journal. It never places, changes or closes      |
//| orders, and it never reads your account password.                |
//| Setup: Tools > Options > Expert Advisors > tick "Allow WebRequest"|
//| and add the Ledgerline address below to the list.                |
//+------------------------------------------------------------------+
#property strict
extern string LedgerlineUrl = "https://YOUR-LEDGERLINE-API/api/metatrader/ingest"; // shown in Settings > MetaTrader
extern string Token         = "";   // paste the token from Settings > MetaTrader
extern int    DaysBack      = 30;
extern int    EverySeconds  = 120;

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

void Send()
{
   string items = ""; int count = 0; datetime newest = lastSent;
   for(int i = OrdersHistoryTotal() - 1; i >= 0 && count < 150; i--)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_HISTORY)) continue;
      if(OrderType() > OP_SELL || OrderCloseTime() <= lastSent) continue;   // only closed buys and sells
      if(count > 0) items += ",";
      items += "{\"ticket\":\"" + IntegerToString(OrderTicket()) + "\",\"symbol\":\"" + OrderSymbol() + "\",\"type\":\"" + (OrderType() == OP_BUY ? "buy" : "sell") + "\","
            + "\"volume\":" + DoubleToString(OrderLots(), 2) + ",\"open_time\":" + IntegerToString((int)OrderOpenTime()) + ",\"open_price\":" + DoubleToString(OrderOpenPrice(), 8)
            + ",\"sl\":" + DoubleToString(OrderStopLoss(), 8) + ",\"tp\":" + DoubleToString(OrderTakeProfit(), 8) + ",\"close_time\":" + IntegerToString((int)OrderCloseTime())
            + ",\"close_price\":" + DoubleToString(OrderClosePrice(), 8) + ",\"commission\":" + DoubleToString(OrderCommission(), 2) + "}";
      count++; if(OrderCloseTime() > newest) newest = OrderCloseTime();
   }
   // With no new closed trades this still posts an empty list, so Ledgerline can show the link as connected.
   string body = "{\"account\":\"" + IntegerToString(AccountNumber()) + "\",\"trades\":[" + items + "]}";
   char post[], result[]; string headers = "Content-Type: application/json\r\nAuthorization: Bearer " + Token + "\r\n", rh;
   StringToCharArray(body, post, 0, StringLen(body));
   int code = WebRequest("POST", LedgerlineUrl, headers, 8000, post, result, rh);
   if(code == 200) { lastSent = newest; if(count > 0) Print("Ledgerline: sent ", count, " closed trades."); }
   else Print("Ledgerline: not sent (", code, "). ", code == -1 ? "Allow the address in Tools > Options > Expert Advisors." : CharArrayToString(result));
}
