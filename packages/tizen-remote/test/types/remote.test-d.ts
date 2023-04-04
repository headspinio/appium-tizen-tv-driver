// @ts-check

import {expectAssignable} from 'tsd';

import {KeyCmd, KeyCommandType, BadCode, Event, TizenRemoteEventData} from '../..';

expectAssignable<Record<string, KeyCommandType>>(KeyCmd);

expectAssignable<Record<number, string>>(BadCode);
expectAssignable<Record<string, keyof TizenRemoteEventData>>(Event);
