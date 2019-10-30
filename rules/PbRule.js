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

function PbRuleClass() {
    let factory = dashjs.FactoryMaker;
    let SwitchRequest = factory.getClassFactoryByName('SwitchRequest');
    let MetricsModel = factory.getSingletonFactoryByName('MetricsModel');
    let Debug = factory.getSingletonFactoryByName('Debug');
    let metricsModel = MetricsModel(context).getInstance();
    const abrController = rulesContext.getAbrController();
    var mediaType = rulesContext.getMediaInfo().type;
    var metrics = metricsModel.getMetricsFor(mediaType, true);
    const throughputHistory = abrController.getThroughputHistory();
    const streamInfo = rulesContext.getStreamInfo();
    const isDynamic = streamInfo && streamInfo.manifestInfo ? streamInfo.manifestInfo.isDynamic : null;

    let context = this.context;
    let instance,
        logger;
    const cdfRange = 20
    let cdf = (new Array(cdfRange)).fill(0);
    let prevThrouput = -1;
    let dataNum = 0;

    function setup() {
        logger = Debug(context).getInstance().getLogger(instance);
        setInterval(calcCDF, 2000);
    }

    function calcCDF() {
        const throughput = throughputHistory.getSafeAverageThroughput(mediaType, isDynamic);
        const x = prevThrouput !== -1 ? 1 : prevThrouput / throughput;
        cdf[Math.min(Math.floor(x * (cdfRange / 2)), cdfRange-1)] += 1;
        dataNum += 1
    }

    function getMinimunX(ep) {
        let acum = (new Array(cdfRange + 1)).fill(0);
        for(let i=1; i<cdfRange+1; i++) {
            acum[i] = acum[i-1] + cdf[i-1]
        }
        for(let i = acum.length-1; i>=0; i--) {
            if ((acum[i] / dataNum) <= 1 - ep) {
                return i / cdfRange;
            }
        }
        return 0;
    }

    function getMaxIndex(rulesContext) {
        // here you can get some informations about metrics for example, to implement the rule
 
        
        console.log("throughput: ", throughput + "kbit/s")
        
        // this sample only display metrics in console
        // console.log(metrics.BufferLevel.);

        //TODO: MetricsにCDFを追加する: 過去のスループットから

        return SwitchRequest(context).create();
    }

    instance = {
        getMaxIndex: getMaxIndex
    };

    setup();

    return instance;
}

PbRuleClass.__dashjs_factory_name = 'PbRule';
PbRule = dashjs.FactoryMaker.getClassFactory(PbRuleClass); //jshint ignore:line

