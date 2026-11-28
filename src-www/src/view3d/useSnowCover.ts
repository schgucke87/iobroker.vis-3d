import { useEffect, useState } from 'react';
import type { ProjectStyle } from '../model/types';
import { fetchOpenMeteoSnow, snowAmount, snowDepthFromState } from '../model/snow';
import { useConnection, useStateValue } from '../iobroker/connect';
import { useWeather } from './Weather3D';

export interface SnowCover {
    /** 0…1, 0 = no snow lying. */
    amount: number;
    depthCm?: number;
    source: 'datapoint' | 'openmeteo' | 'falling' | 'preset' | null;
    /** Time of the Open-Meteo value. */
    time?: Date;
    /** Why Open-Meteo gave nothing. */
    error?: string;
}

/**
 * How much snow lies outside: a chosen datapoint first, then Open-Meteo's
 * modelled snow depth for the ioBroker location; while it is snowing there
 * is at least a dusting.
 */
export function useSnowCover(style: ProjectStyle): SnowCover {
    const weather = useWeather(style);
    const live = style.weather === 'live';
    const stateVal = useStateValue(live ? style.snowStateId || undefined : undefined);
    const backend = useConnection(s => s.backend);
    const [om, setOm] = useState<{ depthCm: number; time: Date } | null>(null);
    const [error, setError] = useState<string | undefined>();
    const useOm = live && !!style.snowOpenMeteo;

    useEffect(() => {
        if (!useOm || !backend) {
            setOm(null);
            setError(undefined);
            return;
        }
        let alive = true;
        const load = async () => {
            const loc = await backend.getLocation();
            if (!alive) return;
            if (!loc) {
                setError('kein Standort in den ioBroker-Systemeinstellungen');
                return;
            }
            try {
                const r = await fetchOpenMeteoSnow(loc.latitude, loc.longitude);
                if (!alive) return;
                setOm(r);
                setError(r ? undefined : 'keine Schneehöhe erhalten');
            } catch (e) {
                if (alive) setError(String((e as Error)?.message ?? e));
            }
        };
        void load();
        const t = setInterval(() => void load(), 10 * 60 * 1000);
        return () => {
            alive = false;
            clearInterval(t);
        };
    }, [useOm, backend]);

    const falling = weather ? Math.min(0.45, weather.snow * 0.45) : 0;
    if (style.weather === 'off') return { amount: 0, source: null };
    if (style.weather === 'snow') return { amount: snowAmount(8), depthCm: 8, source: 'preset' };
    if (!live) return { amount: 0, source: null };

    const fromState = style.snowStateId ? snowDepthFromState(stateVal) : undefined;
    if (fromState !== undefined) return { amount: Math.max(snowAmount(fromState), falling), depthCm: fromState, source: 'datapoint' };
    if (useOm && om) return { amount: Math.max(snowAmount(om.depthCm), falling), depthCm: om.depthCm, source: 'openmeteo', time: om.time, error };
    return { amount: falling, source: falling > 0 ? 'falling' : null, error: useOm ? error : undefined };
}
