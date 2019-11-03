/**
 * The copyright in this software is being made available under the BSD License,
 * included below. This software may be subject to other third party and contributor
 * rights, including patent rights, and no such rights are granted under this license.
 *
 * Copyright (c) 2013, Dash Industry Forum.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *  * Redistributions of source code must retain the above copyright notice, this
 *  list of conditions and the following disclaimer.
 *  * Redistributions in binary form must reproduce the above copyright notice,
 *  this list of conditions and the following disclaimer in the documentation and/or
 *  other materials provided with the distribution.
 *  * Neither the name of Dash Industry Forum nor the names of its
 *  contributors may be used to endorse or promote products derived from this software
 *  without specific prior written permission.
 *
 *  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS AS IS AND ANY
 *  EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 *  WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
 *  IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
 *  INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT
 *  NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 *  PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
 *  WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 *  ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 *  POSSIBILITY OF SUCH DAMAGE.
 */

var PbRule;

function PbRuleClass(config) {
    let context = this.context
    config = config || {};
    const dashMetrics = config.dashMetrics;
    let instance,
        logger;
    const segDuration = 2.5; // TODO: 要検証　HTTPRequestの_mediadurationから決め打ち
    const cdfRange = 20;
    let cdf = (new Array(cdfRange)).fill(0);
    let prevThrouput = -1;
    let dataNum = 0;
    let currentThroughput;
    let playStartTime;
    let requestN;
    let prevHttpLen;

    let factory = dashjs.FactoryMaker;
    let EventBus = factory.getSingletonFactoryByName('EventBus');
    let SwitchRequest = factory.getClassFactoryByName('SwitchRequest');
    let MetricsModel = factory.getSingletonFactoryByName('MetricsModel');
    let Debug = factory.getSingletonFactoryByName('Debug');
    let metricsModel = MetricsModel(context).getInstance();
    const eventBus = EventBus(context).getInstance();
    const mediaPlayerModel = config.mediaPlayerModel;

    function setup() {
        logger = Debug(context).getInstance().getLogger(instance);
        // setInterval(calcCDF, 2000);

        eventBus.on(dashjs.MediaPlayer.events.BUFFER_EMPTY, onBufferEmpty, instance);
        eventBus.on(dashjs.MediaPlayer.events.CAN_PLAY, onCanPlay, instance);
    }

    function onBufferEmpty(e) {
        logger.debug("バッファがない！！！");
    }

    function onCanPlay(e) {
        logger.debug("再生かいし！！");
        playStartTime = new Date().getTime();
        requestN = 1;
        console.log(e);
    }

    function calcCDF(throughput) {
        const x = (prevThrouput === -1) ? 1 : prevThrouput / throughput;
        cdf[Math.min(Math.floor(x * (cdfRange / 2)), cdfRange - 1)] += 1;
        dataNum += 1
        prevThrouput = throughput;
    }

    function getMinimunX(ep) {
        let acum = (new Array(cdfRange + 1)).fill(0);
        for (let i = 1; i < cdfRange + 1; i++) {
            acum[i] = acum[i - 1] + cdf[i - 1];
        }
        for (let i = acum.length - 1; i >= 0; i--) {
            if ((acum[i] / dataNum) <= 1 - ep) {
                return (i+1) / (cdfRange/2);
            }
        }
        logger.debug("x: minimux ratio");
        return 1e-5;
    }

    // filling state: 最低ビットレートを提供
    // steady state: 次のDLスケジュールも行う
    // DL直前に呼ばれる
    function getMaxIndex(rulesContext) {
        const ep = 0.25
        const abrController = rulesContext.getAbrController();
        const scheduleController = rulesContext.getScheduleController();
        const mediaInfo = rulesContext.getMediaInfo();
        var mediaType = mediaInfo.type;
        var metrics = metricsModel.getMetricsFor(mediaType, true);
        const throughputHistory = abrController.getThroughputHistory();
        const streamInfo = rulesContext.getStreamInfo();
        const isDynamic = streamInfo && streamInfo.manifestInfo ? streamInfo.manifestInfo.isDynamic : null;
        currentThroughput = throughputHistory.getSafeAverageThroughput(mediaType, isDynamic);

        const currentBufferLevel = dashMetrics.getCurrentBufferLevel(mediaType, true);
        const maxBufferLevel = mediaPlayerModel.getStableBufferTime();
        let nextBitrate = 0;
        // console.log("buf level :", currentBufferLevel);

        calcCDF(currentThroughput);

        if (metrics.RequestsQueue) {
            const reqList = metrics.RequestsQueue.executedRequests;
            if (reqList && reqList.length > 1 && typeof playStartTime !== 'undefined') {
                const initRequestTime = playStartTime;
                let b, tsn;

                if ((typeof prevHttpLen !== 'undefined') && prevHttpLen !== metrics.HttpList.length) {
                    requestN++;
                }
                prevHttpLen = metrics.HttpList.length
                const tn = initRequestTime + requestN * segDuration;
                const now = new Date().getTime();
                if (tn > now) {
                    tsn = tn;
                    b = maxBufferLevel;
                } else {
                    tsn = now;
                    b = currentBufferLevel;
                }
                const x = getMinimunX(ep);
                const gamma = 1 - (b + segDuration - maxBufferLevel) / (segDuration * x);
                nextBitrate = prevThrouput * (1 - gamma);
                console.log("initRequestTime: ", initRequestTime);
                console.log("tn: ", tn);
                console.log("tsn: ", tsn);
                console.log("requestN: ", requestN);
                console.log("maxbuf: ", maxBufferLevel);
                console.log("currentbuf: ", currentBufferLevel);
                console.log("minimux ratio x* = ", x);
                console.log("cdf: ", cdf);
                console.log("gamma: ", gamma);
                console.log("next scheduling time: ", tsn - new Date().getTime());
                console.log("prev throughput: ", prevThrouput, "kbit/s");
                console.log("nextBitrate: ", nextBitrate, "kbit/s");
                // scheduleController.startScheduleTimer(tsn - new Date().getTime());
                // scheduleController.setTimeToLoadDelay(0)
            } else {

            }
        } else {
            // まだrequestQueueが存在しないので即時次のリクエストをだす
            scheduleController.startScheduleTimer(0)
            // console.log(scheduleController);
            // scheduleController.setTimeToLoadDelay(0)
        }
        console.log(metrics);
        // console.log(JSON.stringify(metrics.RequestsQueue));
        // if (metrics.RequestsQueue) {
        //     const reqList = metrics.RequestsQueue.executedRequests;
        //     logger.debug("latest request start time: ", reqList[reqList.length - 1].requestStartDate.getTime());
        // }
        const switchRequest = SwitchRequest(context).create();
        switchRequest.quality = abrController.getQualityForBitrate(mediaInfo, nextBitrate, null);
        console.log("next bitrate index: ", switchRequest.quality);
        return switchRequest;
    }

    instance = {
        getMaxIndex: getMaxIndex
    };

    setup();

    return instance;
}

PbRuleClass.__dashjs_factory_name = 'PbRule';
PbRule = dashjs.FactoryMaker.getClassFactory(PbRuleClass); //jshint ignore:line

