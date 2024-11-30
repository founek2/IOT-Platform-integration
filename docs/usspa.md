# Usspa protocol
All communication is done via POST on url <https://in.usspa.cz/app/>. Requests body is send via `data` key as URL encoded body.

## Login
This is used only for checking of valid sn/password combination. There is absolutely no security in place.

Send this as data: `Login,SERIAL_NUMBER,PASSWORD` and expect one of these responses:
- `ErrCode,1` - Invalid credentials
- `Login:ErrCode,0` - Success

## Commands

### Request data format
`SN:SERIAL_NUMBER;Cmd,COMMAND`

### Available commands
All commands have been captured by intercepting android [SmartApp USSPA](https://play.google.com/store/apps/details?id=cz.usspa.smartapp&hl=cs) v1.60.

- GetTimeZone
  - GetTimeZone:ErrCode,0;TimeZone,1
- GetNotifications
  - GetNotifications:ErrCode,0;Notifications,
- GetAutomation
  - GetAutomation:ErrCode,0;Automation,0
- GetIdegisCfg
  - GetIdegisCfg:ErrCode,0;IdegisCfg,0-0-0
- GetLastConn
  - GetLastConn:ErrCode,0;LastConn,2024-11-30 16:35:19
- GetPump1
  - GetPump1:ErrCode,0;Pump1,0
- SetPump1 - example `SN:SERIAL_NUMBER;Cmd,SetPump1;Pump1,0` (Virgo has allowed values: 0, 1, 2)
  - SetPump1:ErrCode,0
- GetPump2
  - GetPump2:ErrCode,0;Pump2,0
- SetPump2
  - SetPump2:ErrCode,0
- GetPump3
  - GetPump3:ErrCode,0;Pump3,0
- SetPump3
  - SetPump3:ErrCode,0
- GetLight1
  - GetLight1:ErrCode,0;Light1,0
- SetLight1 - `SN:SERIAL_NUMBER;Cmd,SetLight1;Light1,1` 
  - SetLight1:ErrCode,0
- GetActTemp
  - GetActTemp:ErrCode,0;ActTemp,37.81
- GetReqTemp
  - GetReqTemp:ErrCode,0;ReqTemp,38.00
- GetHeaterState
  - GetHeaterState:ErrCode,0;HeaterState,1
- GetFiltrState
  - GetFiltrState:ErrCode,0;FiltrState,0
- GetOffMode
  - GetOffMode:ErrCode,0;OffMode,0
- GetSafeMode
  - GetSafeMode:ErrCode,0;SafeMode,0
- GetNextStart
  - GetNextStart:ErrCode,0;NextStart,14010100
- GetDayLightSaving
  - GetDayLightSaving:ErrCode,0;DayLightSaving,1
- GetAlarmCode
  - GetAlarmCode:ErrCode,0;AlarmCode,
- GetCommand
  - ```
  GetCommand:ErrCode,0;SN:SERIAL_NUMBER-XXXX;ReqTemp,38.00,2024-11-29 18:26:45;Filtration,0,0000-00-00 00:00:00;SafeMode,0,0000-00-00 00:00:00;SwVer,33.0.148,0000-00-00 00:00:00;MixHour,8,0000-00-00 00:00:00;ActDateTime,2024-11-30 01:00:00,0000-00-00 00:00:00;MFiltrHours,0-0-0-0-0-0-0-0-60-60-60-60-60-60-0-0-0-0-0-0-0-0-0-0,0000-00-00 00:00:00;NextStart,14010100,0000-00-00 00:00:00;Econo,0,2024-11-19 10:15:19;EconoHours,1-0-0-0-0-0-0-0-0-0-0-0-0-0-0-0-0-0-0-0-0-0-0-0,2024-11-19 10:15:19;TimeZone,1,0000-00-00 00:00:00;Pump1,0,2024-11-23 22:13:30;Pump2,0,0000-00-00 00:00:00;Pump3,0,2024-11-18 17:56:18;Light1,0,2024-11-18 21:47:04;Light2,0,0000-00-00 00:00:00;DayLightSaving,1,0000-00-00 00:00:00;NotificationReset,,2024-11-29 16:55:14;ProductionDate,2024-11-14,0000-00-00 00:00:00;SpaInstallDate,2024-11-18,0000-00-00 00:00:00;HeaterState,1,0000-00-00 00:00:00;FiltrState,0,0000-00-00 00:00:00;HDOConf,0,0000-00-00 00:00:00;HDOState,0,0000-00-00 00:00:00;Automation,0,0000-00-00 00:00:00;AFiltrStart1,09:00,0000-00-00 00:00:00;AFiltrStart2,21:00,0000-00-00 00:00:00;OffMode,0,0000-00-00 00:00:00;OffModeTime,00:00,0000-00-00 00:00:00;HeatingSpeed,1.00,0000-00-00 00:00:00;ActPH,0.00,0000-00-00 00:00:00;ActORP,0,0000-00-00 00:00:00;ActPPM,0,0000-00-00 00:00:00;MagnetsCfg,0,0000-00-00 00:00:00;ReqPH,0.00,0000-00-00 00:00:00;ReqORP,0,0000-00-00 00:00:00;ReqPPM,0,0000-00-00 00:00:00;IdegisCfg,0-0-0,0000-00-00 00:00:00;AutTouch,0,0000-00-00 00:00:00;AutFilter,0,0000-00-00 00:00:00;AFiltrPhase0,180,0000-00-00 00:00:00;AFiltrPhase1,180,0000-00-00 00:00:00;AFiltrPhase2,120,0000-00-00 00:00:00;AFiltrPhase3,60,0000-00-00 00:00:00;ChemDelay,0,0000-00-00 00:00:00;SendLogStatus,0,0000-00-00 00:00:00;UpdateFwStatus,0,0000-00-00 00:00:00;Pump1Ctrl,1-1-1,0000-00-00 00:00:00;Pump2Ctrl,1-1,0000-00-00 00:00:00;Pump3Ctrl,1-1,0000-00-00 00:00:00;EmailAddr1,Skalicky.milos@seznam.cz,0000-00-00 00:00:00;EmailAddr2,,0000-00-00 00:00:00;EmailAddr3,spa@usspa.cz,0000-00-00 00:00:00;WebPeriod,10,0000-00-00 00:00:00;WebServer,in.usspa.cz,0000-00-00 00:00:00;DiagWaitOn,3,0000-00-00 00:00:00;DiagWaitOff,3,0000-00-00 00:00:00;DiagVoltWaitOn,500,0000-00-00 00:00:00;DiagVoltWaitOff,1000,0000-00-00 00:00:00;PumpTimeout,20,0000-00-00 00:00:00;Exchanger1CLimit,60,0000-00-00 00:00:00;WLevelTimeout,60,0000-00-00 00:00:00;WLevelWait,15,0000-00-00 00:00:00;FanStart,41.0,0000-00-00 00:00:00;FanStop,39.0,0000-00-00 00:00:00;FtpServer,in.usspa.cz,0000-00-00 00:00:00;RS4850Cfg,0,0000-00-00 00:00:00;RS4851Cfg,0,0000-00-00 00:00:00;FlowWaitCfg,30,0000-00-00 00:00:00;BtVendor,2C:11:65,0000-00-00 00:00:00;ActTemp,37.81,0000-00-00 00:00:00;Reset,1,2024-11-21 09:37:54;UpdateFw,1,2024-11-25 11:25:24;SendLog,1,2024-11-25 11:26:20;TmpEnergyResetDateTime,2024-11-14 09:32:40,0000-00-00 00:00:00;EnergyResetDateTime,2024-11-14 09:32:41,0000-00-00 00:00:00;SNControl,00202485017,2024-11-21 09:36:36;Notifications,,2024-11-29 16:55:19;AlarmCode,,2024-11-30 03:23:25;LastConn,2024-11-30 16:35:19,2024-11-30 16:35:19;
  ```